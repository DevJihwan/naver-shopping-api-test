const fs = require('fs').promises;
const axios = require('axios');
const path = require('path');

class APIStartDateUpdater {
    constructor() {
        this.delay = 800; // 0.8초 딜레이 (API가 더 빠르므로 딜레이 줄임)
        this.maxRetries = 3;
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    }

    // 딜레이 함수
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // API를 통해 연재 시작일과 완결 여부 수집
    async getStartDateFromAPI(productNo, totalCount = 150) {
        try {
            const apiUrl = `https://series.naver.com/novel/volumeList.series?productNo=${productNo}&sortOrder=ASC&totalCount=${totalCount}`;
            
            console.log(`📡 API 요청: ${apiUrl}`);
            
            const response = await axios.get(apiUrl, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Referer': `https://series.naver.com/novel/detail.series?productNo=${productNo}`,
                    'X-Requested-With': 'XMLHttpRequest',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                timeout: 10000
            });

            if (response.data && response.data.resultData && Array.isArray(response.data.resultData)) {
                const volumes = response.data.resultData;
                
                if (volumes.length > 0) {
                    const firstVolume = volumes[0];
                    const lastVolume = volumes[volumes.length - 1];
                    
                    // 연재 시작일 추출 (첫 번째 화의 등록일)
                    let startDate = null;
                    if (firstVolume.registerDate) {
                        // registerDate를 YYYY-MM-DD 형태로 변환
                        const date = new Date(firstVolume.registerDate);
                        startDate = date.toISOString().split('T')[0];
                    } else if (firstVolume.lastVolumeUpdateDate) {
                        // lastVolumeUpdateDate를 YYYY-MM-DD 형태로 변환
                        const date = new Date(firstVolume.lastVolumeUpdateDate);
                        startDate = date.toISOString().split('T')[0];
                    }
                    
                    // 완결 여부 판단
                    let terminationStatus = null;
                    if (lastVolume.termination !== undefined) {
                        terminationStatus = lastVolume.termination ? '완결' : '연재중';
                    } else if (lastVolume.terminationYn !== undefined) {
                        terminationStatus = lastVolume.terminationYn === 'Y' ? '완결' : '연재중';
                    }
                    
                    console.log(`✅ API 응답 성공:`);
                    console.log(`   총 화수: ${volumes.length}개`);
                    console.log(`   연재 시작일: ${startDate}`);
                    console.log(`   완결 여부: ${terminationStatus}`);
                    console.log(`   첫 화 등록일: ${firstVolume.registerDate}`);
                    console.log(`   마지막 화 업데이트: ${lastVolume.lastVolumeUpdateDate}`);
                    console.log(`   완결 플래그: ${lastVolume.termination}`);
                    
                    return {
                        "연재 시작일": startDate,
                        "완결 여부": terminationStatus,
                        "총 화수": volumes.length,
                        "첫 화 등록일": firstVolume.registerDate,
                        "마지막 업데이트": lastVolume.lastVolumeUpdateDate
                    };
                } else {
                    console.log(`⚠️  API 응답에 화 데이터가 없습니다.`);
                    return null;
                }
            } else {
                console.log(`⚠️  API 응답 형식이 올바르지 않습니다.`);
                return null;
            }
        } catch (error) {
            console.error(`❌ API 요청 실패: ${error.message}`);
            return null;
        }
    }

    // 단일 소설의 연재 시작일과 완결 여부 업데이트
    async updateNovelStartDate(novel) {
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                console.log(`\n🔄 업데이트 중: ${novel["제목"]} (ID: ${novel["작품ID"]}) - 시도 ${attempt}/${this.maxRetries}`);
                
                const apiData = await this.getStartDateFromAPI(novel["작품ID"]);
                
                if (apiData) {
                    // 기존 데이터에 업데이트된 정보 병합
                    const updatedNovel = {
                        ...novel,
                        "연재 시작일": apiData["연재 시작일"] || novel["연재 시작일"],
                        "완결 여부": apiData["완결 여부"] || novel["완결 여부"],
                        // 추가 정보도 저장
                        "API_총화수": apiData["총 화수"],
                        "API_첫화등록일": apiData["첫 화 등록일"],
                        "API_마지막업데이트": apiData["마지막 업데이트"]
                    };
                    
                    console.log(`✅ 업데이트 완료: 연재 시작일=${updatedNovel["연재 시작일"]}, 완결 여부=${updatedNovel["완결 여부"]}`);
                    return updatedNovel;
                } else {
                    throw new Error('API 데이터 수집 실패');
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

    // 기존 결과 파일 찾기
    async findLatestOutputFile() {
        try {
            // 현재 디렉토리와 output 디렉토리 모두 확인
            const searchDirs = ['.', './output'];
            let allDetailedFiles = [];
            
            for (const dir of searchDirs) {
                try {
                    const files = await fs.readdir(dir);
                    const detailedFiles = files
                        .filter(file => file.startsWith('naver_series_api_updated_') && file.endsWith('.json'))
                        .map(file => ({
                            file: path.join(dir, file),
                            name: file,
                            dir: dir
                        }));
                    allDetailedFiles.push(...detailedFiles);
                } catch (error) {
                    // 디렉토리가 없으면 무시
                }
            }
            
            if (allDetailedFiles.length > 0) {
                // 파일명에서 타임스탬프 추출하여 정렬
                const filesWithTime = allDetailedFiles.map(fileInfo => {
                    const match = fileInfo.name.match(/naver_series_api_updated_(.+)\.json/);
                    const timestamp = match ? match[1] : '';
                    return { ...fileInfo, timestamp };
                }).sort((a, b) => b.timestamp.localeCompare(a.timestamp));

                const latestFile = filesWithTime[0].file;
                console.log(`🔍 기존 API 업데이트 파일 발견: ${latestFile}`);
                return latestFile;
            }
            
            return null;
        } catch (error) {
            console.log(`파일 탐색 중 오류: ${error.message}`);
            return null;
        }
    }

    // 메인 업데이트 함수
    async updateStartDates(inputFilePath, outputFilePath = null, startIndex = 0, batchSize = 10) {
        try {
            console.log(`\n🚀 === API 기반 연재 시작일 업데이트 시작 ===`);
            console.log(`📁 입력 파일: ${inputFilePath}`);
            
            // 기존 API 업데이트 파일 확인
            const existingApiFile = await this.findLatestOutputFile();
            if (existingApiFile) {
                console.log(`📁 기존 API 업데이트 파일 사용: ${existingApiFile}`);
                inputFilePath = existingApiFile;
            }
            
            // 출력 파일 경로 설정
            if (!outputFilePath) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                outputFilePath = `output/naver_series_api_updated_${timestamp}.json`;
            }
            console.log(`📁 출력 파일: ${outputFilePath}`);

            // 입력 파일 읽기
            const inputData = JSON.parse(await fs.readFile(inputFilePath, 'utf8'));
            
            // 작가명이 있는 작품 중 연재 시작일이 여전히 null인 작품들 필터링
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

                // 배치 내 순차 처리
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
                        apiUpdateDate: new Date().toISOString(),
                        apiUpdatedCount: startIndex + i + batch.length,
                        apiTotalUpdateTarget: validAuthorNovels.length,
                        apiUpdateProgress: `${(((startIndex + i + batch.length) / validAuthorNovels.length) * 100).toFixed(2)}%`
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

            console.log(`\n🎉 === API 업데이트 완료 ===`);
            console.log(`결과 파일: ${outputFilePath}`);
            
            return updatedNovels;

        } catch (error) {
            console.error('❌ API 업데이트 중 오류 발생:', error);
            throw error;
        }
    }
}

// 사용법
async function main() {
    const updater = new APIStartDateUpdater();
    
    const inputFile = 'output/naver_series_detailed_2025-07-02T01-11-37-898Z.json';
    
    try {
        // 배치 크기 10으로 설정 (API가 더 빠르므로 크기 증가)
        await updater.updateStartDates(inputFile, null, 0, 10);
    } catch (error) {
        console.error('❌ 실행 중 오류:', error);
    }
}

// 스크립트 직접 실행 시
if (require.main === module) {
    main();
}

module.exports = APIStartDateUpdater;