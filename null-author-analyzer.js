const fs = require('fs').promises;
const path = require('path');

class NullAuthorAnalyzer {
    constructor() {
        this.inputFile = 'output/naver_series_detailed_2025-07-02T01-11-37-898Z.json';
    }

    async analyzeNullAuthors() {
        try {
            console.log('🔍 파일 분석을 시작합니다...');
            console.log(`📁 입력 파일: ${this.inputFile}`);
            
            // 파일 읽기
            const data = await fs.readFile(this.inputFile, 'utf8');
            const parsedData = JSON.parse(data);
            
            console.log(`\n📊 === 전체 데이터 통계 ===`);
            console.log(`총 처리된 작품 수: ${parsedData.detailedNovels.length.toLocaleString()}개`);
            console.log(`수집 완료율: ${parsedData.collectionSummary.progressRate}`);
            console.log(`수집 완료 시간: ${parsedData.collectionSummary.detailCollectionDate}`);
            
            // 작가명이 null인 데이터 필터링
            const nullAuthorNovels = parsedData.detailedNovels.filter(novel => novel["작가명"] === null);
            
            console.log(`\n❌ === 작가명 null 데이터 분석 ===`);
            console.log(`작가명이 null인 작품 수: ${nullAuthorNovels.length.toLocaleString()}개`);
            console.log(`전체 대비 비율: ${((nullAuthorNovels.length / parsedData.detailedNovels.length) * 100).toFixed(2)}%`);
            
            // 작가명이 null인 작품들의 샘플 표시
            console.log(`\n📋 === 작가명 null 작품 샘플 (첫 10개) ===`);
            nullAuthorNovels.slice(0, 10).forEach((novel, index) => {
                console.log(`[${index + 1}] ${novel["제목"]} (ID: ${novel["작품ID"]})`);
                console.log(`    장르: ${novel["장르"] || 'null'}`);
                console.log(`    평점: ${novel["평점"] || 'null'}`);
                console.log(`    완결여부: ${novel["완결 여부"] || 'null'}`);
                console.log(`    회차 수: ${novel["회차 수"] || 'null'}`);
                console.log(`    URL: ${novel["fullUrl"]}`);
                console.log('');
            });
            
            // 작가명이 null인 데이터들의 다른 필드 통계
            console.log(`\n📈 === 작가명 null 데이터의 다른 필드 통계 ===`);
            
            const nullAuthorStats = {
                totalCount: nullAuthorNovels.length,
                genreStats: {},
                ratingStats: { hasRating: 0, noRating: 0, avgRating: 0 },
                statusStats: {},
                episodeStats: { hasEpisode: 0, noEpisode: 0, avgEpisode: 0 }
            };
            
            let totalRating = 0;
            let ratingCount = 0;
            let totalEpisodes = 0;
            let episodeCount = 0;
            
            nullAuthorNovels.forEach(novel => {
                // 장르 통계
                const genre = novel["장르"] || 'null';
                nullAuthorStats.genreStats[genre] = (nullAuthorStats.genreStats[genre] || 0) + 1;
                
                // 평점 통계
                if (novel["평점"] !== null && novel["평점"] !== undefined) {
                    nullAuthorStats.ratingStats.hasRating++;
                    totalRating += novel["평점"];
                    ratingCount++;
                } else {
                    nullAuthorStats.ratingStats.noRating++;
                }
                
                // 연재 상태 통계
                const status = novel["완결 여부"] || 'null';
                nullAuthorStats.statusStats[status] = (nullAuthorStats.statusStats[status] || 0) + 1;
                
                // 회차 수 통계
                if (novel["회차 수"] !== null && novel["회차 수"] !== undefined) {
                    nullAuthorStats.episodeStats.hasEpisode++;
                    totalEpisodes += novel["회차 수"];
                    episodeCount++;
                } else {
                    nullAuthorStats.episodeStats.noEpisode++;
                }
            });
            
            nullAuthorStats.ratingStats.avgRating = ratingCount > 0 ? (totalRating / ratingCount).toFixed(2) : 0;
            nullAuthorStats.episodeStats.avgEpisode = episodeCount > 0 ? Math.round(totalEpisodes / episodeCount) : 0;
            
            console.log(`🏷️  장르별 분포:`);
            Object.entries(nullAuthorStats.genreStats)
                .sort((a, b) => b[1] - a[1])
                .forEach(([genre, count]) => {
                    const percentage = ((count / nullAuthorNovels.length) * 100).toFixed(1);
                    console.log(`    ${genre}: ${count}개 (${percentage}%)`);
                });
            
            console.log(`\n⭐ 평점 통계:`);
            console.log(`    평점 있음: ${nullAuthorStats.ratingStats.hasRating}개`);
            console.log(`    평점 없음: ${nullAuthorStats.ratingStats.noRating}개`);
            console.log(`    평균 평점: ${nullAuthorStats.ratingStats.avgRating}점`);
            
            console.log(`\n📚 연재 상태별 분포:`);
            Object.entries(nullAuthorStats.statusStats)
                .sort((a, b) => b[1] - a[1])
                .forEach(([status, count]) => {
                    const percentage = ((count / nullAuthorNovels.length) * 100).toFixed(1);
                    console.log(`    ${status}: ${count}개 (${percentage}%)`);
                });
            
            console.log(`\n📖 회차 수 통계:`);
            console.log(`    회차 수 있음: ${nullAuthorStats.episodeStats.hasEpisode}개`);
            console.log(`    회차 수 없음: ${nullAuthorStats.episodeStats.noEpisode}개`);
            console.log(`    평균 회차 수: ${nullAuthorStats.episodeStats.avgEpisode}회`);
            
            // 작가명이 null인 데이터들을 별도 파일로 저장
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const outputFile = `output/null_author_novels_${timestamp}.json`;
            
            const outputData = {
                analysisInfo: {
                    sourceFile: this.inputFile,
                    analysisDate: new Date().toISOString(),
                    totalNovels: parsedData.detailedNovels.length,
                    nullAuthorCount: nullAuthorNovels.length,
                    nullAuthorRatio: `${((nullAuthorNovels.length / parsedData.detailedNovels.length) * 100).toFixed(2)}%`
                },
                statistics: nullAuthorStats,
                nullAuthorNovels: nullAuthorNovels
            };
            
            await fs.writeFile(outputFile, JSON.stringify(outputData, null, 2), 'utf8');
            
            console.log(`\n💾 === 저장 완료 ===`);
            console.log(`작가명 null 데이터 저장: ${outputFile}`);
            console.log(`저장된 데이터 수: ${nullAuthorNovels.length.toLocaleString()}개`);
            
            // 정상적으로 작가명이 있는 데이터도 통계로 보여주기
            const validAuthorNovels = parsedData.detailedNovels.filter(novel => novel["작가명"] !== null);
            console.log(`\n✅ === 정상 데이터 통계 ===`);
            console.log(`작가명이 있는 작품 수: ${validAuthorNovels.length.toLocaleString()}개`);
            console.log(`전체 대비 비율: ${((validAuthorNovels.length / parsedData.detailedNovels.length) * 100).toFixed(2)}%`);
            
            return {
                totalNovels: parsedData.detailedNovels.length,
                nullAuthorNovels: nullAuthorNovels.length,
                validAuthorNovels: validAuthorNovels.length,
                outputFile: outputFile,
                statistics: nullAuthorStats
            };
            
        } catch (error) {
            console.error('❌ 분석 중 오류 발생:', error.message);
            throw error;
        }
    }
}

// 사용법
async function main() {
    const analyzer = new NullAuthorAnalyzer();
    
    try {
        const result = await analyzer.analyzeNullAuthors();
        console.log('\n🎉 분석이 완료되었습니다!');
    } catch (error) {
        console.error('❌ 실행 중 오류:', error.message);
    }
}

// 스크립트 직접 실행 시
if (require.main === module) {
    main();
}

module.exports = NullAuthorAnalyzer;