const fs = require('fs').promises;
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

class HTMLCompletionChecker {
    constructor() {
        this.delay = 1000; // 1초 딜레이 (서버 부하 방지)
        this.maxRetries = 3;
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
        this.successCount = 0;
        this.failCount = 0;
        this.unchangedCount = 0;
        this.changedCount = 0;
    }

    // 딜레이 함수
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // HTML에서 완결 여부 추출
    async getCompletionStatusFromHTML(productNo) {
        try {
            const url = `https://series.naver.com/novel/detail.series?productNo=${productNo}`;
            
            console.log(`🌐 HTML 요청: ${url}`);
            
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                timeout: 15000
            });

            const $ = cheerio.load(response.data);
            
            // 완결 여부 찾기 - 여러 패턴 시도
            let completionStatus = null;
            
            // 패턴 1: <li class="info_lst"> 내의 <span>완결</span> 또는 <span>연재중</span>
            const infoLst = $('li.info_lst');
            if (infoLst.length > 0) {
                const spans = infoLst.find('span');
                spans.each((i, elem) => {
                    const text = $(elem).text().trim();
                    if (text === '완결' || text === '연재중') {
                        completionStatus = text;
                        console.log(`✅ 패턴 1에서 발견: ${completionStatus}`);
                        return false; // break
                    }
                });
            }
            
            // 패턴 2: 다른 위치에서 완결/연재중 텍스트 찾기
            if (!completionStatus) {
                $('span, div, li').each((i, elem) => {
                    const text = $(elem).text().trim();
                    if (text === '완결' || text === '연재중') {
                        completionStatus = text;
                        console.log(`✅ 패턴 2에서 발견: ${completionStatus}`);
                        return false; // break
                    }
                });
            }
            
            // 패턴 3: 클래스명이나 데이터 속성에서 찾기
            if (!completionStatus) {
                const statusElements = $('[class*="complete"], [class*="ongoing"], [data-status]');
                if (statusElements.length > 0) {
                    statusElements.each((i, elem) => {
                        const className = $(elem).attr('class') || '';
                        const dataStatus = $(elem).attr('data-status') || '';
                        const text = $(elem).text().trim();
                        
                        if (className.includes('complete') || dataStatus.includes('complete') || text.includes('완결')) {
                            completionStatus = '완결';
                            console.log(`✅ 패턴 3에서 완결 발견`);
                            return false;
                        } else if (className.includes('ongoing') || dataStatus.includes('ongoing') || text.includes('연재')) {
                            completionStatus = '연재중';
                            console.log(`✅ 패턴 3에서 연재중 발견`);
                            return false;
                        }
                    });
                }
            }
            
            // 패턴 4: 메타 정보나 JSON-LD에서 찾기
            if (!completionStatus) {
                const scriptTags = $('script[type="application/ld+json"]');
                scriptTags.each((i, elem) => {
                    try {
                        const jsonData = JSON.parse($(elem).html());
                        if (jsonData.workStatus) {
                            completionStatus = jsonData.workStatus === 'completed' ? '완결' : '연재중';
                            console.log(`✅ 패턴 4에서 발견: ${completionStatus}`);
                            return false;
                        }
                    } catch (e) {
                        // JSON 파싱 실패 무시
                    }
                });
            }
            
            // 추가 정보 수집
            const additionalInfo = {
                title: $('h1, .title, .work_title').first().text().trim() || null,
                author: $('.author, .writer').first().text().trim() || null,
                genre: $('li.info_lst a[href*="genreCode"]').first().text().trim() || null,
                totalEpisodes: null
            };
            
            // 총 화수 찾기
            const episodeTexts = $('*').contents().filter(function() {
                return this.nodeType === 3 && $(this).text().includes('화');
            });
            
            episodeTexts.each((i, elem) => {
                const text = $(elem).text();
                const match = text.match(/(\d+)화/);
                if (match) {
                    const episodeNum = parseInt(match[1]);
                    if (!additionalInfo.totalEpisodes || episodeNum > additionalInfo.totalEpisodes) {
                        additionalInfo.totalEpisodes = episodeNum;
                    }
                }
            });
            
            console.log(`📋 HTML 파싱 결과:`);
            console.log(`   완결 여부: ${completionStatus || '찾을 수 없음'}`);
            console.log(`   제목: ${additionalInfo.title || '찾을 수 없음'}`);
            console.log(`   작가: ${additionalInfo.author || '찾을 수 없음'}`);
            console.log(`   장르: ${additionalInfo.genre || '찾을 수 없음'}`);
            console.log(`   총 화수: ${additionalInfo.totalEpisodes || '찾을 수 없음'}`);
            
            return {
                completionStatus,
                ...additionalInfo
            };
            
        } catch (error) {
            console.error(`❌ HTML 파싱 실패: ${error.message}`);
            if (error.response) {
                console.error(`   HTTP 상태: ${error.response.status}`);
                console.error(`   응답 크기: ${error.response.data ? error.response.data.length : 0} bytes`);
            }
            return null;
        }
    }

    // 단일 작품의 완결 여부 업데이트
    async updateNovelCompletionStatus(novel) {
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                console.log(`\n🔄 검증 중: ${novel["제목"]} (ID: ${novel["작품ID"]}) - 시도 ${attempt}/${this.maxRetries}`);
                
                const htmlData = await this.getCompletionStatusFromHTML(novel["작품ID"]);
                
                if (htmlData && htmlData.completionStatus) {
                    const originalStatus = novel["완결 여부"];
                    const newStatus = htmlData.completionStatus;
                    
                    // 기존 데이터에 업데이트된 정보 병합
                    const updatedNovel = {
                        ...novel,
                        "완결 여부": newStatus,
                        // HTML에서 수집한 추가 정보 저장
                        "HTML_제목": htmlData.title,
                        "HTML_작가": htmlData.author,
                        "HTML_장르": htmlData.genre,
                        "HTML_총화수": htmlData.totalEpisodes,
                        "HTML_검증일": new Date().toISOString().split('T')[0]
                    };
                    
                    // 변경 여부 확인
                    if (originalStatus !== newStatus) {
                        console.log(`🔄 완결 여부 변경: ${originalStatus} → ${newStatus}`);
                        this.changedCount++;
                    } else {
                        console.log(`✅ 완결 여부 일치: ${newStatus}`);
                        this.unchangedCount++;
                    }
                    
                    this.successCount++;
                    return updatedNovel;
                } else {
                    throw new Error('HTML에서 완결 여부를 찾을 수 없음');
                }
            } catch (error) {
                console.error(`❌ 오류 발생 (${novel["제목"]}, 시도 ${attempt}):`, error.message);
                
                if (attempt === this.maxRetries) {
                    console.error(`❌ 최대 재시도 횟수 초과: ${novel["제목"]}`);
                    this.failCount++;
                    // 업데이트 실패 시 원본 데이터 반환 (실패 표시 추가)
                    return {
                        ...novel,
                        "HTML_검증실패": true,
                        "HTML_검증일": new Date().toISOString().split('T')[0]
                    };
                }
                
                // 재시도 전 딜레이 (점진적 증가)
                await this.sleep(this.delay * attempt);
            }
        }
    }

    // 시간 형식 변환 함수
    formatTime(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}시간 ${minutes % 60}분 ${seconds % 60}초`;
        } else if (minutes > 0) {
            return `${minutes}분 ${seconds % 60}초`;
        } else {
            return `${seconds}초`;
        }
    }

    // 메인 검증 함수
    async updateCompletionStatuses(inputFilePath, outputFilePath = null, startIndex = 0, batchSize = 5) {
        try {
            console.log(`\n🚀 === HTML 기반 완결 여부 검증 시작 ===`);
            console.log(`📁 입력 파일: ${inputFilePath}`);
            
            // 출력 파일 경로 설정
            if (!outputFilePath) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                outputFilePath = `output/naver_series_html_verified_${timestamp}.json`;
                console.log(`📁 출력 파일: ${outputFilePath}`);
            }

            // output 디렉토리 생성
            const outputDir = path.dirname(outputFilePath);
            try {
                await fs.mkdir(outputDir, { recursive: true });
            } catch (error) {
                // 디렉토리가 이미 존재하는 경우 무시
            }

            // 입력 파일 읽기
            const inputData = JSON.parse(await fs.readFile(inputFilePath, 'utf8'));
            const allNovels = inputData.detailedNovels;
            
            // 검증 대상 필터링 (작가명이 있는 작품만)
            const validNovels = allNovels.filter(novel => 
                novel["작가명"] !== null && novel["작가명"] !== undefined && novel["작가명"] !== ''
            );
            
            console.log(`\n📊 === 검증 대상 통계 ===`);
            console.log(`전체 작품 수: ${allNovels.length.toLocaleString()}개`);
            console.log(`검증 대상 작품 수: ${validNovels.length.toLocaleString()}개`);
            console.log(`시작 인덱스: ${startIndex}`);
            console.log(`배치 크기: ${batchSize}개`);
            
            // 시작 인덱스부터 처리
            const targetNovels = validNovels.slice(startIndex);
            console.log(`실제 처리 대상: ${targetNovels.length.toLocaleString()}개`);
            
            if (targetNovels.length === 0) {
                console.log(`\n⚠️ 처리할 작품이 없습니다.`);
                return allNovels;
            }
            
            // 결과 저장용 배열 (기존 데이터 복사)
            let updatedNovels = [...allNovels];
            
            // 진행률 추적 변수
            const startTime = Date.now();
            let processedCount = 0;
            const totalTarget = targetNovels.length;
            
            // 통계 초기화
            this.successCount = 0;
            this.failCount = 0;
            this.unchangedCount = 0;
            this.changedCount = 0;
            
            // 배치 단위로 처리
            for (let i = 0; i < targetNovels.length; i += batchSize) {
                const batch = targetNovels.slice(i, Math.min(i + batchSize, targetNovels.length));
                const currentBatchStart = startIndex + i + 1;
                const currentBatchEnd = startIndex + Math.min(i + batchSize, targetNovels.length);
                
                console.log(`\n📦 === 배치 처리: ${currentBatchStart} ~ ${currentBatchEnd} (전체 ${validNovels.length}개 중) ===`);
                
                // 진행률 계산
                const overallProgress = (((startIndex + i) / validNovels.length) * 100).toFixed(2);
                const currentBatchProgress = ((processedCount / totalTarget) * 100).toFixed(2);
                
                console.log(`📈 전체 진행률: ${overallProgress}% | 현재 세션: ${currentBatchProgress}%`);
                
                // 진행 바 표시
                const progressBarLength = 30;
                const filledLength = Math.round((processedCount / totalTarget) * progressBarLength);
                const progressBar = '█'.repeat(filledLength) + '░'.repeat(progressBarLength - filledLength);
                console.log(`[${progressBar}] ${processedCount}/${totalTarget}`);
                
                // 예상 완료 시간 계산
                if (processedCount > 0) {
                    const elapsed = Date.now() - startTime;
                    const avgTimePerItem = elapsed / processedCount;
                    const remaining = totalTarget - processedCount;
                    const estimatedTimeLeft = (remaining * avgTimePerItem);
                    const estimatedFinish = new Date(Date.now() + estimatedTimeLeft);
                    
                    console.log(`⏱️  평균 처리 시간: ${(avgTimePerItem / 1000).toFixed(1)}초/개`);
                    console.log(`🕒 예상 완료 시간: ${estimatedFinish.toLocaleString('ko-KR')}`);
                    console.log(`⏰ 남은 시간: ${this.formatTime(estimatedTimeLeft)}`);
                }

                // 배치 내 순차 처리
                for (let j = 0; j < batch.length; j++) {
                    const novel = batch[j];
                    const updatedNovel = await this.updateNovelCompletionStatus(novel);
                    
                    // 원본 배열에서 해당 작품 찾아서 업데이트
                    const originalIndex = updatedNovels.findIndex(n => n["작품ID"] === novel["작품ID"]);
                    if (originalIndex !== -1) {
                        updatedNovels[originalIndex] = updatedNovel;
                    }
                    
                    processedCount++;
                    
                    // 개별 작품 처리 진행률 표시
                    const itemProgress = ((processedCount / totalTarget) * 100).toFixed(1);
                    console.log(`   ✅ ${processedCount}/${totalTarget} (${itemProgress}%) - ${novel["제목"]}`);
                    
                    // 요청 간 딜레이
                    if (j < batch.length - 1) {
                        await this.sleep(this.delay);
                    }
                }

                console.log(`\n📊 배치 완료: 성공 ${this.successCount}개, 실패 ${this.failCount}개`);
                console.log(`   변경: ${this.changedCount}개, 유지: ${this.unchangedCount}개`);

                // 중간 저장
                const outputData = {
                    collectionSummary: {
                        ...inputData.collectionSummary,
                        htmlVerificationDate: new Date().toISOString(),
                        htmlVerifiedCount: startIndex + i + batch.length,
                        htmlTotalVerificationTarget: validNovels.length,
                        htmlVerificationProgress: `${(((startIndex + i + batch.length) / validNovels.length) * 100).toFixed(2)}%`,
                        htmlProcessedInSession: processedCount,
                        htmlSessionProgress: `${((processedCount / totalTarget) * 100).toFixed(2)}%`,
                        htmlVerificationStats: {
                            successCount: this.successCount,
                            failCount: this.failCount,
                            changedCount: this.changedCount,
                            unchangedCount: this.unchangedCount
                        }
                    },
                    detailedNovels: updatedNovels
                };

                await fs.writeFile(outputFilePath, JSON.stringify(outputData, null, 2), 'utf8');
                
                const saveProgress = (((startIndex + i + batch.length) / validNovels.length) * 100).toFixed(2);
                console.log(`💾 중간 저장 완료: ${startIndex + i + batch.length}/${validNovels.length} (${saveProgress}%)`);

                // 배치 간 딜레이
                if (i + batchSize < targetNovels.length) {
                    const waitTime = this.delay * 2;
                    console.log(`⏱️  ${waitTime}ms 대기 중...`);
                    await this.sleep(waitTime);
                }
            }

            // 최종 통계
            const endTime = Date.now();
            const totalTime = endTime - startTime;

            console.log(`\n🎉 === HTML 검증 완료 ===`);
            console.log(`📊 세션 통계:`);
            console.log(`   - 처리된 작품: ${processedCount}개`);
            console.log(`   - 성공: ${this.successCount}개`);
            console.log(`   - 실패: ${this.failCount}개`);
            console.log(`   - 변경된 작품: ${this.changedCount}개`);
            console.log(`   - 유지된 작품: ${this.unchangedCount}개`);
            console.log(`   - 총 소요 시간: ${this.formatTime(totalTime)}`);
            console.log(`   - 평균 처리 시간: ${(totalTime / processedCount / 1000).toFixed(1)}초/개`);
            console.log(`📁 결과 파일: ${outputFilePath}`);
            
            return updatedNovels;

        } catch (error) {
            console.error('❌ HTML 검증 중 오류 발생:', error);
            throw error;
        }
    }
}

// 사용법
async function main() {
    const checker = new HTMLCompletionChecker();
    
    const inputFile = './output/naver_series_api_updated_2025-07-03T17-19-55-691Z.json';
    
    try {
        // 배치 크기 5로 설정 (HTML 파싱은 더 느리므로 작게 설정)
        await checker.updateCompletionStatuses(inputFile, null, 0, 5);
    } catch (error) {
        console.error('❌ 실행 중 오류:', error);
    }
}

// 스크립트 직접 실행 시
if (require.main === module) {
    main();
}

module.exports = HTMLCompletionChecker;