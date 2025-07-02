const fs = require('fs').promises;
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

class NaverSeriesScraper {
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

    // 기존 작업 파일 찾기
    async findExistingWorkFile(outputDirectory = './output') {
        try {
            const files = await fs.readdir(outputDirectory);
            const detailedFiles = files
                .filter(file => file.startsWith('naver_series_detailed_') && file.endsWith('.json'))
                .map(file => ({
                    name: file,
                    fullPath: path.join(outputDirectory, file),
                    // 파일명에서 타임스탬프 추출하여 정렬용
                    timestamp: file.replace('naver_series_detailed_', '').replace('.json', '')
                }))
                .sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // 최신 순 정렬

            return detailedFiles.length > 0 ? detailedFiles[0] : null;
        } catch (error) {
            console.log('기존 작업 파일 검색 중 오류:', error.message);
            return null;
        }
    }

    // 작업 재개 여부 확인
    async promptForResume(existingFile) {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            rl.question(`기존 작업 파일을 발견했습니다: ${existingFile.name}\n작업을 이어서 하시겠습니까? (y/n): `, (answer) => {
                rl.close();
                resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
            });
        });
    }

    // HTML에서 추가 데이터 추출 (기본 정보는 제외)
    extractDataFromHtml(html) {
        const $ = cheerio.load(html);
        
        try {
            // 웹페이지에서 추출할 추가 데이터
            const data = {
                "작가명": null,
                "장르": null,
                "키워드": "웹소설",
                "줄거리 요약": null,
                "연재 시작일": null,
                "회차 수": null,
                "완결 여부": null,
                "조회수": null,
                "평점": null,
                "댓글 수": null
            };

            // 평점 추출
            const rating = $('.score_area em').text().trim();
            if (rating) data["평점"] = parseFloat(rating);

            // 댓글수 추출
            const commentCount = $('#commentCount').text().trim();
            if (commentCount) data["댓글 수"] = parseInt(commentCount);

            // 상세 정보 추출 (연재상태, 장르, 작가, 출판사)
            $('.end_info .info_lst ul li').each((index, element) => {
                const $li = $(element);
                const text = $li.text().trim();
                
                // 연재상태 확인
                if ($li.hasClass('ing')) {
                    data["완결 여부"] = $li.find('span').text().trim();
                }
                
                // 장르 확인 (categoryProductList가 포함된 링크)
                const genreLink = $li.find('a[href*="categoryProductList"]');
                if (genreLink.length > 0) {
                    data["장르"] = genreLink.text().trim();
                }
                
                // 작가 확인 (글이라는 텍스트가 있는 경우)
                if (text.includes('글') && $li.find('a').length > 0) {
                    data["작가명"] = $li.find('a').text().trim();
                }
            });

            // 줄거리 추출
            const synopsis = $('._synopsis').html();
            if (synopsis) {
                // HTML 태그 제거하고 &nbsp; 등의 엔티티를 공백으로 변환
                data["줄거리 요약"] = synopsis
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/<[^>]*>/g, '')
                    .trim();
            }

            // 회차수 추출
            const episodeCount = $('.end_total_episode strong').text().trim();
            if (episodeCount) data["회차 수"] = parseInt(episodeCount);

            return data;
        } catch (error) {
            console.error(`데이터 추출 중 오류 발생:`, error.message);
            return null;
        }
    }

    // 단일 소설 정보 수집
    async scrapeNovelDetail(novel) {
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                console.log(`수집 중: ${novel.title} (${novel.productNo}) - 시도 ${attempt}/${this.maxRetries}`);
                
                const response = await axios.get(novel.fullUrl, {
                    headers: {
                        'User-Agent': this.userAgent,
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'ko-KR,ko;q=0.8,en-US;q=0.5,en;q=0.3',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Connection': 'keep-alive',
                        'Upgrade-Insecure-Requests': '1',
                    },
                    timeout: 10000
                });

                const additionalData = this.extractDataFromHtml(response.data);
                
                if (additionalData) {
                    // 기본 정보와 추가 정보를 요청받은 순서대로 결합
                    const completeData = {
                        "제목": novel.title,
                        "작가명": additionalData["작가명"],
                        "작품ID": novel.productNo,
                        "장르": additionalData["장르"],
                        "키워드": additionalData["키워드"],
                        "줄거리 요약": additionalData["줄거리 요약"],
                        "연재 시작일": additionalData["연재 시작일"],
                        "회차 수": additionalData["회차 수"],
                        "완결 여부": additionalData["완결 여부"],
                        "조회수": additionalData["조회수"],
                        "평점": additionalData["평점"],
                        "댓글 수": additionalData["댓글 수"],
                        // 참조용 URL 정보
                        "detailUrl": novel.detailUrl,
                        "fullUrl": novel.fullUrl
                    };
                    return completeData;
                } else {
                    throw new Error('데이터 추출 실패');
                }
            } catch (error) {
                console.error(`오류 발생 (${novel.title}, 시도 ${attempt}):`, error.message);
                
                if (attempt === this.maxRetries) {
                    console.error(`최대 재시도 횟수 초과: ${novel.title}`);
                    return null;
                }
                
                // 재시도 전 딜레이
                await this.sleep(this.delay * attempt);
            }
        }
    }

    // 진행률 표시
    showProgress(current, total, novel) {
        const percentage = ((current / total) * 100).toFixed(2);
        const progressBar = '█'.repeat(Math.floor(percentage / 2)) + '░'.repeat(50 - Math.floor(percentage / 2));
        console.log(`[${progressBar}] ${percentage}% (${current}/${total}) - ${novel.title}`);
    }

    // 메인 수집 함수
    async scrapeAllNovels(inputFilePath, outputFilePath = null, startIndex = 0, batchSize = 10, forceNew = false) {
        try {
            // 입력 파일 읽기
            console.log('기본 정보 파일을 읽는 중...');
            const inputData = JSON.parse(await fs.readFile(inputFilePath, 'utf8'));
            const novels = inputData.novels;
            
            console.log(`총 ${novels.length}개의 소설 발견`);

            let results = [];
            let processedCount = startIndex;
            let finalOutputPath = outputFilePath;

            // 강제로 새 파일을 만들지 않는 경우, 기존 작업 파일 확인
            if (!forceNew && !outputFilePath) {
                const existingFile = await this.findExistingWorkFile();
                if (existingFile) {
                    const shouldResume = await this.promptForResume(existingFile);
                    if (shouldResume) {
                        finalOutputPath = existingFile.fullPath;
                        try {
                            const existingData = await fs.readFile(finalOutputPath, 'utf8');
                            const existingResults = JSON.parse(existingData);
                            if (existingResults.detailedNovels) {
                                results = existingResults.detailedNovels;
                                processedCount = results.length;
                                console.log(`기존 결과 파일에서 ${processedCount}개의 처리된 항목을 이어서 작업합니다.`);
                            }
                        } catch (error) {
                            console.log('기존 파일 읽기 실패, 새로 시작합니다.');
                        }
                    }
                }
            }

            // 출력 파일 경로가 지정되지 않았으면 새로 생성
            if (!finalOutputPath) {
                finalOutputPath = outputFilePath || ('./output/naver_series_detailed_' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
                console.log('새로운 결과 파일을 생성합니다.');
            }

            console.log(`출력 파일: ${finalOutputPath}`);
            console.log(`시작 위치: ${processedCount}/${novels.length}`);

            // 배치 단위로 처리
            for (let i = Math.max(startIndex, processedCount); i < novels.length; i += batchSize) {
                const batch = novels.slice(i, Math.min(i + batchSize, novels.length));
                console.log(`\n배치 처리: ${i + 1} ~ ${Math.min(i + batchSize, novels.length)}`);

                // 배치 내 병렬 처리
                const batchPromises = batch.map(async (novel, index) => {
                    await this.sleep(index * 500); // 요청 간격 조절
                    return await this.scrapeNovelDetail(novel);
                });

                const batchResults = await Promise.all(batchPromises);
                
                // 성공한 결과만 추가
                for (const result of batchResults) {
                    if (result) {
                        results.push(result);
                    }
                }

                // 중간 저장
                const outputData = {
                    collectionSummary: {
                        ...inputData.collectionSummary,
                        detailCollectionDate: new Date().toISOString(),
                        processedCount: results.length,
                        totalCount: novels.length,
                        progressRate: `${((results.length / novels.length) * 100).toFixed(2)}%`
                    },
                    detailedNovels: results
                };

                await fs.writeFile(finalOutputPath, JSON.stringify(outputData, null, 2), 'utf8');
                console.log(`중간 저장 완료: ${results.length}/${novels.length} 처리됨`);

                // 배치 간 딜레이
                if (i + batchSize < novels.length) {
                    console.log(`${this.delay * 2}ms 대기 중...`);
                    await this.sleep(this.delay * 2);
                }
            }

            console.log('\n=== 수집 완료 ===');
            console.log(`총 처리: ${results.length}/${novels.length}`);
            console.log(`결과 파일: ${finalOutputPath}`);

            return results;

        } catch (error) {
            console.error('수집 중 오류 발생:', error);
            throw error;
        }
    }
}

// 사용법
async function main() {
    const scraper = new NaverSeriesScraper();
    
    // 명령행 인자 처리
    const args = process.argv.slice(2);
    const inputFile = args[0] || './output/naver_series_complete_2025-07-01T14-52-19-024Z.json';
    const outputFile = args[1] || null; // null이면 자동으로 찾거나 생성
    const forceNew = args.includes('--new'); // --new 플래그로 강제로 새 파일 생성
    
    console.log('=== 네이버 시리즈 상세 정보 수집기 ===');
    console.log(`입력 파일: ${inputFile}`);
    if (forceNew) {
        console.log('강제 새 파일 생성 모드');
    }
    
    try {
        await scraper.scrapeAllNovels(inputFile, outputFile, 0, 5, forceNew); // 배치 크기 5로 설정
    } catch (error) {
        console.error('실행 중 오류:', error);
    }
}

// 스크립트 직접 실행 시
if (require.main === module) {
    main();
}

module.exports = NaverSeriesScraper;