const fs = require('fs').promises;
const path = require('path');

class NullStartDateAnalyzer {
    constructor() {
        this.inputFile = 'output/naver_series_detailed_2025-07-02T01-11-37-898Z.json';
    }

    async analyzeNullStartDates() {
        try {
            console.log('🔍 연재 시작일 null 데이터 분석을 시작합니다...');
            console.log(`📁 입력 파일: ${this.inputFile}`);
            
            // 파일 읽기
            const data = await fs.readFile(this.inputFile, 'utf8');
            const parsedData = JSON.parse(data);
            
            console.log(`\n📊 === 전체 데이터 통계 ===`);
            console.log(`총 처리된 작품 수: ${parsedData.detailedNovels.length.toLocaleString()}개`);
            console.log(`수집 완료율: ${parsedData.collectionSummary.progressRate}`);
            console.log(`수집 완료 시간: ${parsedData.collectionSummary.detailCollectionDate}`);
            
            // 작가명이 있는 작품만 필터링
            const validAuthorNovels = parsedData.detailedNovels.filter(novel => novel["작가명"] !== null);
            console.log(`\n✅ 작가명이 있는 작품 수: ${validAuthorNovels.length.toLocaleString()}개`);
            
            // 작가명이 있는 작품 중에서 연재 시작일이 null인 데이터 필터링
            const nullStartDateNovels = validAuthorNovels.filter(novel => 
                novel["연재 시작일"] === null || novel["연재 시작일"] === undefined || novel["연재 시작일"] === ''
            );
            
            console.log(`\n📅 === 연재 시작일 null 데이터 분석 ===`);
            console.log(`연재 시작일이 null인 작품 수: ${nullStartDateNovels.length.toLocaleString()}개`);
            console.log(`작가명 있는 작품 대비 비율: ${((nullStartDateNovels.length / validAuthorNovels.length) * 100).toFixed(2)}%`);
            console.log(`전체 작품 대비 비율: ${((nullStartDateNovels.length / parsedData.detailedNovels.length) * 100).toFixed(2)}%`);
            
            // 연재 시작일이 null인 작품들의 샘플 표시
            console.log(`\n📋 === 연재 시작일 null 작품 샘플 (첫 10개) ===`);
            nullStartDateNovels.slice(0, 10).forEach((novel, index) => {
                console.log(`[${index + 1}] ${novel["제목"]} (ID: ${novel["작품ID"]})`);
                console.log(`    작가명: ${novel["작가명"]}`);
                console.log(`    장르: ${novel["장르"] || 'null'}`);
                console.log(`    평점: ${novel["평점"] || 'null'}`);
                console.log(`    완결여부: ${novel["완결 여부"] || 'null'}`);
                console.log(`    회차 수: ${novel["회차 수"] || 'null'}`);
                console.log(`    연재 시작일: ${novel["연재 시작일"] || 'null'}`);
                console.log(`    URL: ${novel["fullUrl"]}`);
                console.log('');
            });
            
            // 연재 시작일이 null인 데이터들의 다른 필드 통계
            console.log(`\n📈 === 연재 시작일 null 데이터의 다른 필드 통계 ===`);
            
            const nullStartDateStats = {
                totalCount: nullStartDateNovels.length,
                authorStats: {},
                genreStats: {},
                ratingStats: { hasRating: 0, noRating: 0, avgRating: 0 },
                statusStats: {},
                episodeStats: { hasEpisode: 0, noEpisode: 0, avgEpisode: 0 }
            };
            
            let totalRating = 0;
            let ratingCount = 0;
            let totalEpisodes = 0;
            let episodeCount = 0;
            
            nullStartDateNovels.forEach(novel => {
                // 작가별 통계
                const author = novel["작가명"];
                nullStartDateStats.authorStats[author] = (nullStartDateStats.authorStats[author] || 0) + 1;
                
                // 장르 통계
                const genre = novel["장르"] || 'null';
                nullStartDateStats.genreStats[genre] = (nullStartDateStats.genreStats[genre] || 0) + 1;
                
                // 평점 통계
                if (novel["평점"] !== null && novel["평점"] !== undefined) {
                    nullStartDateStats.ratingStats.hasRating++;
                    totalRating += novel["평점"];
                    ratingCount++;
                } else {
                    nullStartDateStats.ratingStats.noRating++;
                }
                
                // 연재 상태 통계
                const status = novel["완결 여부"] || 'null';
                nullStartDateStats.statusStats[status] = (nullStartDateStats.statusStats[status] || 0) + 1;
                
                // 회차 수 통계
                if (novel["회차 수"] !== null && novel["회차 수"] !== undefined) {
                    nullStartDateStats.episodeStats.hasEpisode++;
                    totalEpisodes += novel["회차 수"];
                    episodeCount++;
                } else {
                    nullStartDateStats.episodeStats.noEpisode++;
                }
            });
            
            nullStartDateStats.ratingStats.avgRating = ratingCount > 0 ? (totalRating / ratingCount).toFixed(2) : 0;
            nullStartDateStats.episodeStats.avgEpisode = episodeCount > 0 ? Math.round(totalEpisodes / episodeCount) : 0;
            
            // 작가별 통계 (연재 시작일이 null인 작품이 많은 작가 순)
            console.log(`\n👤 연재 시작일 null 작품이 많은 작가 TOP 10:`);
            Object.entries(nullStartDateStats.authorStats)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .forEach(([author, count], index) => {
                    const percentage = ((count / nullStartDateNovels.length) * 100).toFixed(1);
                    console.log(`    ${index + 1}. ${author}: ${count}개 (${percentage}%)`);
                });
            
            console.log(`\n🏷️  장르별 분포:`);
            Object.entries(nullStartDateStats.genreStats)
                .sort((a, b) => b[1] - a[1])
                .forEach(([genre, count]) => {
                    const percentage = ((count / nullStartDateNovels.length) * 100).toFixed(1);
                    console.log(`    ${genre}: ${count}개 (${percentage}%)`);
                });
            
            console.log(`\n⭐ 평점 통계:`);
            console.log(`    평점 있음: ${nullStartDateStats.ratingStats.hasRating}개`);
            console.log(`    평점 없음: ${nullStartDateStats.ratingStats.noRating}개`);
            console.log(`    평균 평점: ${nullStartDateStats.ratingStats.avgRating}점`);
            
            console.log(`\n📚 연재 상태별 분포:`);
            Object.entries(nullStartDateStats.statusStats)
                .sort((a, b) => b[1] - a[1])
                .forEach(([status, count]) => {
                    const percentage = ((count / nullStartDateNovels.length) * 100).toFixed(1);
                    console.log(`    ${status}: ${count}개 (${percentage}%)`);
                });
            
            console.log(`\n📖 회차 수 통계:`);
            console.log(`    회차 수 있음: ${nullStartDateStats.episodeStats.hasEpisode}개`);
            console.log(`    회차 수 없음: ${nullStartDateStats.episodeStats.noEpisode}개`);
            console.log(`    평균 회차 수: ${nullStartDateStats.episodeStats.avgEpisode}회`);
            
            // 연재 시작일이 있는 작품들의 샘플 확인
            const hasStartDateNovels = validAuthorNovels.filter(novel => 
                novel["연재 시작일"] !== null && novel["연재 시작일"] !== undefined && novel["연재 시작일"] !== ''
            );
            
            console.log(`\n📅 === 연재 시작일이 있는 작품 샘플 (비교용) ===`);
            console.log(`연재 시작일이 있는 작품 수: ${hasStartDateNovels.length.toLocaleString()}개`);
            if (hasStartDateNovels.length > 0) {
                console.log(`샘플 (첫 5개):`);
                hasStartDateNovels.slice(0, 5).forEach((novel, index) => {
                    console.log(`[${index + 1}] ${novel["제목"]} - 연재 시작일: ${novel["연재 시작일"]}`);
                });
            }
            
            // 연재 시작일이 null인 데이터들을 별도 파일로 저장
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const outputFile = `output/null_start_date_novels_${timestamp}.json`;
            
            const outputData = {
                analysisInfo: {
                    sourceFile: this.inputFile,
                    analysisDate: new Date().toISOString(),
                    totalNovels: parsedData.detailedNovels.length,
                    validAuthorNovels: validAuthorNovels.length,
                    nullStartDateCount: nullStartDateNovels.length,
                    hasStartDateCount: hasStartDateNovels.length,
                    nullStartDateRatio: `${((nullStartDateNovels.length / validAuthorNovels.length) * 100).toFixed(2)}%`
                },
                statistics: nullStartDateStats,
                nullStartDateNovels: nullStartDateNovels
            };
            
            await fs.writeFile(outputFile, JSON.stringify(outputData, null, 2), 'utf8');
            
            console.log(`\n💾 === 저장 완료 ===`);
            console.log(`연재 시작일 null 데이터 저장: ${outputFile}`);
            console.log(`저장된 데이터 수: ${nullStartDateNovels.length.toLocaleString()}개`);
            
            console.log(`\n📊 === 최종 요약 ===`);
            console.log(`전체 작품: ${parsedData.detailedNovels.length.toLocaleString()}개`);
            console.log(`작가명 있는 작품: ${validAuthorNovels.length.toLocaleString()}개`);
            console.log(`┣━ 연재 시작일 있음: ${hasStartDateNovels.length.toLocaleString()}개 (${((hasStartDateNovels.length / validAuthorNovels.length) * 100).toFixed(1)}%)`);
            console.log(`┗━ 연재 시작일 null: ${nullStartDateNovels.length.toLocaleString()}개 (${((nullStartDateNovels.length / validAuthorNovels.length) * 100).toFixed(1)}%)`);
            
            return {
                totalNovels: parsedData.detailedNovels.length,
                validAuthorNovels: validAuthorNovels.length,
                nullStartDateNovels: nullStartDateNovels.length,
                hasStartDateNovels: hasStartDateNovels.length,
                outputFile: outputFile,
                statistics: nullStartDateStats
            };
            
        } catch (error) {
            console.error('❌ 분석 중 오류 발생:', error.message);
            throw error;
        }
    }
}

// 사용법
async function main() {
    const analyzer = new NullStartDateAnalyzer();
    
    try {
        const result = await analyzer.analyzeNullStartDates();
        console.log('\n🎉 연재 시작일 분석이 완료되었습니다!');
    } catch (error) {
        console.error('❌ 실행 중 오류:', error.message);
    }
}

// 스크립트 직접 실행 시
if (require.main === module) {
    main();
}

module.exports = NullStartDateAnalyzer;