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
                console.log(`📁 기존 API 업데이트 파일 발견: ${existingApiFile}`);
                inputFilePath = existingApiFile;
            }
            
            // 출력 파일 경로 설정
            if (!outputFilePath) {
                if (existingApiFile) {
                    // 기존 파일이 있으면 같은 파일에 이어서 저장
                    outputFilePath = existingApiFile;
                    console.log(`📁 기존 파일에 이어서 저장: ${outputFilePath}`);
                } else {
                    // 새 파일 생성
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    outputFilePath = `output/naver_series_api_updated_${timestamp}.json`;
                    console.log(`📁 새 파일 생성: ${outputFilePath}`);
                }
            }

            // 입력 파일 읽기
            const inputData = JSON.parse(await fs.readFile(inputFilePath, 'utf8'));
            const allNovels = inputData.detailedNovels;
            
            // 작가명이 있는 작품 중 연재 시작일이 여전히 null인 작품들 필터링
            const validAuthorNovels = allNovels.filter(novel => 
                novel["작가명"] !== null && (
                    novel["연재 시작일"] === null || 
                    novel["연재 시작일"] === undefined || 
                    novel["연재 시작일"] === ''
                )
            );
            
            // 기존 파일에서 마지막 처리된 작품 찾기
            let resumeFromIndex = 0;
            if (existingApiFile) {
                console.log(`\n🔍 기존 처리 결과 확인 중...`);
                
                // 이미 연재 시작일이 업데이트된 작품들 찾기
                const updatedNovels = allNovels.filter(novel => 
                    novel["작가명"] !== null && 
                    novel["연재 시작일"] !== null && 
                    novel["연재 시작일"] !== undefined && 
                    novel["연재 시작일"] !== '' &&
                    novel["API_총화수"] !== undefined // API로 업데이트된 작품 표시
                );
                
                if (updatedNovels.length > 0) {
                    // 마지막으로 API 업데이트된 작품 ID 찾기
                    const lastUpdatedNovel = updatedNovels[updatedNovels.length - 1];
                    const lastUpdatedId = lastUpdatedNovel["작품ID"];
                    
                    console.log(`📍 마지막 API 업데이트된 작품: ${lastUpdatedNovel["제목"]} (ID: ${lastUpdatedId})`);
                    
                    // validAuthorNovels에서 해당 ID 다음부터 시작
                    const lastProcessedIndex = validAuthorNovels.findIndex(novel => novel["작품ID"] === lastUpdatedId);
                    if (lastProcessedIndex !== -1) {
                        resumeFromIndex = lastProcessedIndex + 1;
                        console.log(`✅ 인덱스 ${lastProcessedIndex}까지 API 업데이트 완료`);
                        console.log(`🔄 인덱스 ${resumeFromIndex}부터 재시작`);
                    } else {
                        console.log(`⚠️  마지막 처리된 작품을 업데이트 대상에서 찾을 수 없습니다.`);
                    }
                    
                    console.log(`📊 기존 API 업데이트 완료: ${updatedNovels.length}개`);
                }
            }
            
            console.log(`\n📊 === 업데이트 대상 통계 ===`);
            console.log(`전체 작품 수: ${allNovels.length.toLocaleString()}개`);
            console.log(`업데이트 대상 작품 수: ${validAuthorNovels.length.toLocaleString()}개`);
            console.log(`시작 인덱스: ${resumeFromIndex}`);
            
            // 시작 인덱스부터 처리
            const targetNovels = validAuthorNovels.slice(resumeFromIndex);
            console.log(`실제 처리 대상: ${targetNovels.length.toLocaleString()}개`);
            
            if (targetNovels.length === 0) {
                console.log(`\n🎉 모든 작품이 이미 API 업데이트 완료되었습니다!`);
                return allNovels;
            }
            
            // 결과 저장용 배열 (기존 데이터 복사)
            let updatedNovels = [...allNovels];
            
            // 진행률 추적 변수
            const startTime = Date.now();
            let processedCount = 0;
            const totalTarget = targetNovels.length;
            
            // 배치 단위로 처리
            for (let i = 0; i < targetNovels.length; i += batchSize) {
                const batch = targetNovels.slice(i, Math.min(i + batchSize, targetNovels.length));
                const currentBatchStart = resumeFromIndex + i + 1;
                const currentBatchEnd = resumeFromIndex + Math.min(i + batchSize, targetNovels.length);
                
                console.log(`\n📦 === 배치 처리: ${currentBatchStart} ~ ${currentBatchEnd} (전체 ${validAuthorNovels.length}개 중) ===`);
                
                // 진행률 계산
                const overallProgress = (((resumeFromIndex + i) / validAuthorNovels.length) * 100).toFixed(2);
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
                let batchSuccessCount = 0;
                for (let j = 0; j < batch.length; j++) {
                    const novel = batch[j];
                    const updatedNovel = await this.updateNovelStartDate(novel);
                    
                    // 원본 배열에서 해당 작품 찾아서 업데이트
                    const originalIndex = updatedNovels.findIndex(n => n["작품ID"] === novel["작품ID"]);
                    if (originalIndex !== -1) {
                        updatedNovels[originalIndex] = updatedNovel;
                        
                        // 성공한 경우만 카운트
                        if (updatedNovel["연재 시작일"] !== null && updatedNovel["연재 시작일"] !== undefined) {
                            batchSuccessCount++;
                        }
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

                console.log(`\n📊 배치 완료: ${batchSuccessCount}/${batch.length} 성공`);

                // 중간 저장
                const outputData = {
                    collectionSummary: {
                        ...inputData.collectionSummary,
                        apiUpdateDate: new Date().toISOString(),
                        apiUpdatedCount: resumeFromIndex + i + batch.length,
                        apiTotalUpdateTarget: validAuthorNovels.length,
                        apiUpdateProgress: `${(((resumeFromIndex + i + batch.length) / validAuthorNovels.length) * 100).toFixed(2)}%`,
                        apiProcessedInSession: processedCount,
                        apiSessionProgress: `${((processedCount / totalTarget) * 100).toFixed(2)}%`
                    },
                    detailedNovels: updatedNovels
                };

                await fs.writeFile(outputFilePath, JSON.stringify(outputData, null, 2), 'utf8');
                
                const saveProgress = (((resumeFromIndex + i + batch.length) / validAuthorNovels.length) * 100).toFixed(2);
                console.log(`💾 중간 저장 완료: ${resumeFromIndex + i + batch.length}/${validAuthorNovels.length} (${saveProgress}%)`);

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
            const successCount = updatedNovels.filter(novel => 
                novel["작가명"] !== null && 
                novel["연재 시작일"] !== null && 
                novel["연재 시작일"] !== undefined && 
                novel["연재 시작일"] !== '' &&
                novel["API_총화수"] !== undefined
            ).length;

            console.log(`\n🎉 === API 업데이트 완료 ===`);
            console.log(`📊 세션 통계:`);
            console.log(`   - 처리된 작품: ${processedCount}개`);
            console.log(`   - 총 소요 시간: ${this.formatTime(totalTime)}`);
            console.log(`   - 평균 처리 시간: ${(totalTime / processedCount / 1000).toFixed(1)}초/개`);
            console.log(`📊 전체 통계:`);
            console.log(`   - API 업데이트 완료: ${successCount}개`);
            console.log(`   - 전체 대비 완료율: ${((successCount / validAuthorNovels.length) * 100).toFixed(2)}%`);
            console.log(`📁 결과 파일: ${outputFilePath}`);
            
            return updatedNovels;

        } catch (error) {
            console.error('❌ API 업데이트 중 오류 발생:', error);
            throw error;
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