const fs = require('fs').promises;
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

class StartDateUpdater {
    constructor() {
        this.baseUrl = 'https://series.naver.com';
        this.delay = 1000; // 1초 딜레이
        this.maxRetries = 3;
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    }

    // 딜레이 함수
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 연재 시작일과 완결 여부 추출 (개선된 로직)
    extractStartDateAndStatus(html) {
        const $ = cheerio.load(html);
        
        try {
            const result = {
                "연재 시작일": null,
                "완결 여부": null
            };

            console.log('HTML 구조 분석 중...');
            
            // 방법 1: 상세 정보 영역에서 연재 시작일 찾기
            $('.end_info .info_lst ul li').each((index, element) => {
                const $li = $(element);
                const text = $li.text().trim();
                
                console.log(`정보 항목 ${index}: ${text}`);
                
                // 연재상태 확인
                if ($li.hasClass('ing')) {
                    result["완결 여부"] = $li.find('span').text().trim();
                    console.log(`완결 여부 발견: ${result["완결 여부"]}`);
                }
                
                // 연재 시작일 패턴 찾기 (다양한 패턴 시도)
                const datePatterns = [
                    /(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/,  // 2024. 1. 15
                    /(\d{4})-(\d{1,2})-(\d{1,2})/,         // 2024-01-15
                    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/, // 2024년 1월 15일
                    /연재\s+(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/, // 연재 2024.1.15
                    /시작\s+(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/, // 시작 2024.1.15
                ];
                
                for (const pattern of datePatterns) {
                    const match = text.match(pattern);
                    if (match) {
                        const year = match[1];
                        const month = match[2].padStart(2, '0');
                        const day = match[3].padStart(2, '0');
                        result["연재 시작일"] = `${year}-${month}-${day}`;
                        console.log(`연재 시작일 발견: ${result["연재 시작일"]} (패턴: ${pattern})`);
                        break;
                    }
                }
            });

            // 방법 2: 다른 영역에서 연재 정보 찾기
            if (!result["연재 시작일"]) {
                console.log('다른 영역에서 연재 시작일 검색 중...');
                
                // 메타 정보 영역
                $('.meta_info').each((index, element) => {
                    const text = $(element).text().trim();
                    console.log(`메타 정보 ${index}: ${text}`);
                    
                    const dateMatch = text.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
                    if (dateMatch) {
                        const year = dateMatch[1];
                        const month = dateMatch[2].padStart(2, '0');
                        const day = dateMatch[3].padStart(2, '0');
                        result["연재 시작일"] = `${year}-${month}-${day}`;
                        console.log(`메타 정보에서 연재 시작일 발견: ${result["연재 시작일"]}`);
                    }
                });
            }

            // 방법 3: 전체 HTML에서 연재 시작일 패턴 검색
            if (!result["연재 시작일"]) {
                console.log('전체 HTML에서 연재 시작일 검색 중...');
                
                const allText = $('body').text();
                const globalDateMatch = allText.match(/연재\s*시작[:\s]*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
                if (globalDateMatch) {
                    const year = globalDateMatch[1];
                    const month = globalDateMatch[2].padStart(2, '0');
                    const day = globalDateMatch[3].padStart(2, '0');
                    result["연재 시작일"] = `${year}-${month}-${day}`;
                    console.log(`전체 검색에서 연재 시작일 발견: ${result["연재 시작일"]}`);
                }
            }

            // 방법 4: 완결 여부 추가 검색
            if (!result["완결 여부"]) {
                console.log('완결 여부 추가 검색 중...');
                
                // 다양한 완결 여부 패턴
                const statusPatterns = [
                    { selector: '.status', text: '완결|연재중|휴재|중단' },
                    { selector: '.serial_status', text: '완결|연재중|휴재|중단' },
                    { selector: '.end_status', text: '완결|연재중|휴재|중단' }
                ];
                
                for (const pattern of statusPatterns) {
                    const $element = $(pattern.selector);
                    if ($element.length > 0) {
                        const text = $element.text().trim();
                        const statusMatch = text.match(new RegExp(pattern.text));
                        if (statusMatch) {
                            result["완결 여부"] = statusMatch[0];
                            console.log(`완결 여부 발견: ${result["완결 여부"]}`);
                            break;
                        }
                    }
                }
            }

            console.log(`최종 결과: 연재 시작일=${result["연재 시작일"]}, 완결 여부=${result["완결 여부"]}`);
            return result;
            
        } catch (error) {
            console.error(`데이터 추출 중 오류 발생:`, error.message);
            return null;
        }
    }

    // 단일 소설의 연재 시작일과 완결 여부 수집
    async updateNovelStartDate(novel) {
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                console.log(`\n🔄 업데이트 중: ${novel["제목"]} (${novel["작품ID"]}) - 시도 ${attempt}/${this.maxRetries}`);
                
                const response = await axios.get(novel.fullUrl, {
                    headers: {
                        'User-Agent': this.userAgent,
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'ko-KR,ko;q=0.8,en-US;q=0.5,en;q=0.3',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Connection': 'keep-alive',
                        'Upgrade-Insecure-Requests': '1',
                    },
                    timeout: 15000
                });

                const updateData = this.extractStartDateAndStatus(response.data);
                
                if (updateData) {
                    // 기존 데이터에 업데이트된 정보 병합
                    const updatedNovel = {
                        ...novel,
                        "연재 시작일": updateData["연재 시작일"] || novel["연재 시작일"],
                        "완결 여부": updateData["완결 여부"] || novel["완결 여부"]
                    };
                    
                    console.log(`✅ 업데이트 완료: 연재 시작일=${updatedNovel["연재 시작일"]}, 완결 여부=${updatedNovel["완결 여부"]}`);
                    return updatedNovel;
                } else {
                    throw new Error('데이터 추출 실패');
                }
            } catch (error) {
                console.error(`❌ 오류 발생 (${novel["제목"]}, 시도 ${attempt}):`, error.message);
                
                if (attempt === this.maxRetries) {
                    console.error(`❌ 최대 재시도 횟수 초과: ${novel["제목"]}`);
                    // 업데이트 실패 시 원본 데이터 반환
                    return novel;
                }
                
                // 재시도 전 딜레이
                await this.sleep(this.delay * attempt);
            }
        }
    }

    // 메인 업데이트 함수
    async updateStartDates(inputFilePath, outputFilePath = null, startIndex = 0, batchSize = 5) {
        try {
            console.log(`\n🚀 === 연재 시작일 업데이트 시작 ===`);
            console.log(`📁 입력 파일: ${inputFilePath}`);
            
            // 출력 파일 경로 설정
            if (!outputFilePath) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                outputFilePath = `output/naver_series_start_date_updated_${timestamp}.json`;
            }
            console.log(`📁 출력 파일: ${outputFilePath}`);

            // 입력 파일 읽기
            const inputData = JSON.parse(await fs.readFile(inputFilePath, 'utf8'));
            
            // 작가명이 있는 작품만 필터링 (연재 시작일이 null인 작품들)
            const validAuthorNovels = inputData.detailedNovels.filter(novel => 
                novel["작가명"] !== null && (
                    novel["연재 시작일"] === null || 
                    novel["연재 시작일"] === undefined || 
                    novel["연재 시작일"] === ''
                )
            );
            
            console.log(`\n📊 === 업데이트 대상 통계 ===`);
            console.log(`전체 작품 수: ${inputData.detailedNovels.length.toLocaleString()}개`);
            console.log(`업데이트 대상 작품 수: ${validAuthorNovels.length.toLocaleString()}개`);
            console.log(`시작 인덱스: ${startIndex}`);
            
            // 시작 인덱스부터 처리
            const targetNovels = validAuthorNovels.slice(startIndex);
            console.log(`실제 처리 대상: ${targetNovels.length.toLocaleString()}개`);
            
            // 결과 저장용 배열 (기존 데이터 복사)
            let updatedNovels = [...inputData.detailedNovels];
            
            // 배치 단위로 처리
            for (let i = 0; i < targetNovels.length; i += batchSize) {
                const batch = targetNovels.slice(i, Math.min(i + batchSize, targetNovels.length));
                const currentBatchStart = startIndex + i + 1;
                const currentBatchEnd = startIndex + Math.min(i + batchSize, targetNovels.length);
                
                console.log(`\n📦 === 배치 처리: ${currentBatchStart} ~ ${currentBatchEnd} ===`);

                // 배치 내 순차 처리 (병렬 처리 대신 안정성 확보)
                for (let j = 0; j < batch.length; j++) {
                    const novel = batch[j];
                    const updatedNovel = await this.updateNovelStartDate(novel);
                    
                    // 원본 배열에서 해당 작품 찾아서 업데이트
                    const originalIndex = updatedNovels.findIndex(n => n["작품ID"] === novel["작품ID"]);
                    if (originalIndex !== -1) {
                        updatedNovels[originalIndex] = updatedNovel;
                    }
                    
                    // 요청 간 딜레이
                    if (j < batch.length - 1) {
                        await this.sleep(this.delay);
                    }
                }

                // 중간 저장
                const outputData = {
                    collectionSummary: {
                        ...inputData.collectionSummary,
                        startDateUpdateDate: new Date().toISOString(),
                        updatedCount: startIndex + i + batch.length,
                        totalUpdateTarget: validAuthorNovels.length,
                        updateProgress: `${(((startIndex + i + batch.length) / validAuthorNovels.length) * 100).toFixed(2)}%`
                    },
                    detailedNovels: updatedNovels
                };

                await fs.writeFile(outputFilePath, JSON.stringify(outputData, null, 2), 'utf8');
                
                const progress = (((startIndex + i + batch.length) / validAuthorNovels.length) * 100).toFixed(2);
                console.log(`💾 중간 저장 완료: ${startIndex + i + batch.length}/${validAuthorNovels.length} (${progress}%)`);

                // 배치 간 딜레이
                if (i + batchSize < targetNovels.length) {
                    console.log(`⏱️  ${this.delay * 2}ms 대기 중...`);
                    await this.sleep(this.delay * 2);
                }
            }

            console.log(`\n🎉 === 업데이트 완료 ===`);
            console.log(`결과 파일: ${outputFilePath}`);
            
            return updatedNovels;

        } catch (error) {
            console.error('❌ 업데이트 중 오류 발생:', error);
            throw error;
        }
    }
}

// 사용법
async function main() {
    const updater = new StartDateUpdater();
    
    const inputFile = 'output/naver_series_detailed_2025-07-02T01-11-37-898Z.json';
    
    try {
        await updater.updateStartDates(inputFile, null, 0, 3); // 배치 크기 3으로 안전하게 설정
    } catch (error) {
        console.error('❌ 실행 중 오류:', error);
    }
}

// 스크립트 직접 실행 시
if (require.main === module) {
    main();
}

module.exports = StartDateUpdater;