const fs = require('fs').promises;
const path = require('path');

class SerializationStatusAnalyzer {
    constructor() {
        this.inputFile = 'output/naver_series_api_updated_2025-07-03T17-19-55-691Z.json';
    }

    // 연재 기간 계산 (일 단위)
    calculateSerializationDays(startDate, endDate = null) {
        if (!startDate) return null;
        
        const start = new Date(startDate);
        const end = endDate ? new Date(endDate) : new Date(); // 완결이면 완결일, 연재중이면 현재날짜
        
        if (isNaN(start.getTime())) return null;
        
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    }

    // 연재 상태 정규화
    normalizeStatus(status) {
        if (!status) return '미분류';
        
        const statusStr = status.toString().toLowerCase();
        if (statusStr.includes('완결') || statusStr.includes('complete')) return '완결';
        if (statusStr.includes('연재') || statusStr.includes('ongoing')) return '연재중';
        if (statusStr.includes('휴재') || statusStr.includes('hiatus')) return '휴재';
        if (statusStr.includes('중단') || statusStr.includes('discontinued')) return '중단';
        
        return '미분류';
    }

    // 평점 범위별 분류
    getRatingRange(rating) {
        if (!rating || rating === null) return '평점 없음';
        
        const score = parseFloat(rating);
        if (score >= 9.0) return '9.0~10.0 (최고)';
        if (score >= 8.0) return '8.0~8.9 (우수)';
        if (score >= 7.0) return '7.0~7.9 (양호)';
        if (score >= 6.0) return '6.0~6.9 (보통)';
        if (score >= 5.0) return '5.0~5.9 (미흡)';
        return '5.0 미만 (저조)';
    }

    // 회차 수 범위별 분류
    getEpisodeRange(episodes) {
        if (!episodes || episodes === null) return '회차 정보 없음';
        
        const count = parseInt(episodes);
        if (count >= 1000) return '1000화 이상 (장편)';
        if (count >= 500) return '500~999화 (대작)';
        if (count >= 200) return '200~499화 (중편)';
        if (count >= 100) return '100~199화 (소중편)';
        if (count >= 50) return '50~99화 (소품)';
        if (count >= 20) return '20~49화 (단편)';
        return '20화 미만 (극단편)';
    }

    // 연재 기간별 분류
    getSerializationPeriodRange(days) {
        if (!days || days === null) return '기간 정보 없음';
        
        if (days >= 1095) return '3년 이상';  // 3년 = 1095일
        if (days >= 730) return '2~3년';      // 2년 = 730일
        if (days >= 365) return '1~2년';      // 1년 = 365일
        if (days >= 180) return '6개월~1년';  // 6개월 = 180일
        if (days >= 90) return '3~6개월';     // 3개월 = 90일
        if (days >= 30) return '1~3개월';     // 1개월 = 30일
        return '1개월 미만';
    }

    async analyzeSerializationStatus() {
        try {
            console.log('📊 === 연재 상태 분석 시작 ===');
            console.log(`📁 분석 파일: ${this.inputFile}`);
            
            // 파일 읽기
            const data = await fs.readFile(this.inputFile, 'utf8');
            const parsedData = JSON.parse(data);
            
            console.log(`\n📈 === 기본 통계 ===`);
            console.log(`총 작품 수: ${parsedData.detailedNovels.length.toLocaleString()}개`);
            console.log(`데이터 수집 완료일: ${parsedData.collectionSummary.apiUpdateDate}`);
            
            // API 업데이트된 작품만 필터링 (연재 시작일이 있는 작품)
            const validNovels = parsedData.detailedNovels.filter(novel => 
                novel["연재 시작일"] !== null && 
                novel["연재 시작일"] !== undefined && 
                novel["연재 시작일"] !== '' &&
                novel["API_총화수"] !== undefined
            );
            
            console.log(`API 업데이트 완료 작품: ${validNovels.length.toLocaleString()}개`);
            
            // 분석 결과 저장할 객체
            const analysis = {
                basicStats: {
                    totalNovels: validNovels.length,
                    analysisDate: new Date().toISOString()
                },
                statusAnalysis: {},
                genreAnalysis: {},
                ratingAnalysis: {},
                episodeAnalysis: {},
                serializationPeriodAnalysis: {},
                authorAnalysis: {},
                topLists: {}
            };

            // 1. 연재 상태별 분석
            console.log(`\n📚 === 연재 상태별 분석 ===`);
            const statusStats = {};
            
            validNovels.forEach(novel => {
                const status = this.normalizeStatus(novel["완결 여부"]);
                statusStats[status] = (statusStats[status] || 0) + 1;
            });
            
            Object.entries(statusStats)
                .sort((a, b) => b[1] - a[1])
                .forEach(([status, count]) => {
                    const percentage = ((count / validNovels.length) * 100).toFixed(2);
                    console.log(`${status}: ${count.toLocaleString()}개 (${percentage}%)`);
                });
            
            analysis.statusAnalysis = statusStats;

            // 2. 장르별 연재 상태 분석
            console.log(`\n🏷️  === 장르별 연재 상태 분석 ===`);
            const genreStatusStats = {};
            
            validNovels.forEach(novel => {
                const genre = novel["장르"] || '미분류';
                const status = this.normalizeStatus(novel["완결 여부"]);
                
                if (!genreStatusStats[genre]) {
                    genreStatusStats[genre] = {};
                }
                genreStatusStats[genre][status] = (genreStatusStats[genre][status] || 0) + 1;
            });
            
            // 장르별 총 작품 수로 정렬
            const sortedGenres = Object.entries(genreStatusStats)
                .map(([genre, statuses]) => {
                    const total = Object.values(statuses).reduce((sum, count) => sum + count, 0);
                    return { genre, statuses, total };
                })
                .sort((a, b) => b.total - a.total)
                .slice(0, 10); // 상위 10개 장르만
            
            sortedGenres.forEach(({ genre, statuses, total }) => {
                console.log(`\n${genre} (총 ${total.toLocaleString()}개):`);
                Object.entries(statuses)
                    .sort((a, b) => b[1] - a[1])
                    .forEach(([status, count]) => {
                        const percentage = ((count / total) * 100).toFixed(1);
                        console.log(`  ${status}: ${count.toLocaleString()}개 (${percentage}%)`);
                    });
            });
            
            analysis.genreAnalysis = genreStatusStats;

            // 3. 평점별 연재 상태 분석
            console.log(`\n⭐ === 평점별 연재 상태 분석 ===`);
            const ratingStatusStats = {};
            
            validNovels.forEach(novel => {
                const ratingRange = this.getRatingRange(novel["평점"]);
                const status = this.normalizeStatus(novel["완결 여부"]);
                
                if (!ratingStatusStats[ratingRange]) {
                    ratingStatusStats[ratingRange] = {};
                }
                ratingStatusStats[ratingRange][status] = (ratingStatusStats[ratingRange][status] || 0) + 1;
            });
            
            Object.entries(ratingStatusStats).forEach(([range, statuses]) => {
                const total = Object.values(statuses).reduce((sum, count) => sum + count, 0);
                console.log(`\n${range} (총 ${total.toLocaleString()}개):`);
                Object.entries(statuses)
                    .sort((a, b) => b[1] - a[1])
                    .forEach(([status, count]) => {
                        const percentage = ((count / total) * 100).toFixed(1);
                        console.log(`  ${status}: ${count.toLocaleString()}개 (${percentage}%)`);
                    });
            });
            
            analysis.ratingAnalysis = ratingStatusStats;

            // 4. 회차 수별 분석
            console.log(`\n📖 === 회차 수별 분석 ===`);
            const episodeStats = {};
            
            validNovels.forEach(novel => {
                const episodeRange = this.getEpisodeRange(novel["API_총화수"]);
                episodeStats[episodeRange] = (episodeStats[episodeRange] || 0) + 1;
            });
            
            // 회차 수 순서대로 정렬
            const episodeOrder = [
                '20화 미만 (극단편)',
                '20~49화 (단편)',
                '50~99화 (소품)',
                '100~199화 (소중편)',
                '200~499화 (중편)',
                '500~999화 (대작)',
                '1000화 이상 (장편)',
                '회차 정보 없음'
            ];
            
            episodeOrder.forEach(range => {
                if (episodeStats[range]) {
                    const count = episodeStats[range];
                    const percentage = ((count / validNovels.length) * 100).toFixed(2);
                    console.log(`${range}: ${count.toLocaleString()}개 (${percentage}%)`);
                }
            });
            
            analysis.episodeAnalysis = episodeStats;

            // 5. 연재 기간별 분석 (연재중 작품만)
            console.log(`\n📅 === 연재 기간별 분석 (연재중 작품) ===`);
            const ongoingNovels = validNovels.filter(novel => 
                this.normalizeStatus(novel["완결 여부"]) === '연재중'
            );
            
            const periodStats = {};
            
            ongoingNovels.forEach(novel => {
                const days = this.calculateSerializationDays(novel["연재 시작일"]);
                const periodRange = this.getSerializationPeriodRange(days);
                periodStats[periodRange] = (periodStats[periodRange] || 0) + 1;
            });
            
            const periodOrder = [
                '1개월 미만',
                '1~3개월',
                '3~6개월',
                '6개월~1년',
                '1~2년',
                '2~3년',
                '3년 이상',
                '기간 정보 없음'
            ];
            
            periodOrder.forEach(range => {
                if (periodStats[range]) {
                    const count = periodStats[range];
                    const percentage = ((count / ongoingNovels.length) * 100).toFixed(2);
                    console.log(`${range}: ${count.toLocaleString()}개 (${percentage}%)`);
                }
            });
            
            analysis.serializationPeriodAnalysis = periodStats;

            // 6. 작가별 통계 (상위 20명)
            console.log(`\n👤 === 작가별 작품 수 TOP 20 ===`);
            const authorStats = {};
            
            validNovels.forEach(novel => {
                const author = novel["작가명"] || '미분류';
                if (!authorStats[author]) {
                    authorStats[author] = {
                        total: 0,
                        completed: 0,
                        ongoing: 0,
                        avgRating: 0,
                        totalRating: 0,
                        ratedWorks: 0
                    };
                }
                
                authorStats[author].total++;
                
                const status = this.normalizeStatus(novel["완결 여부"]);
                if (status === '완결') authorStats[author].completed++;
                if (status === '연재중') authorStats[author].ongoing++;
                
                if (novel["평점"] && novel["평점"] !== null) {
                    authorStats[author].totalRating += parseFloat(novel["평점"]);
                    authorStats[author].ratedWorks++;
                }
            });
            
            // 평균 평점 계산
            Object.keys(authorStats).forEach(author => {
                if (authorStats[author].ratedWorks > 0) {
                    authorStats[author].avgRating = (authorStats[author].totalRating / authorStats[author].ratedWorks).toFixed(2);
                }
            });
            
            const topAuthors = Object.entries(authorStats)
                .sort((a, b) => b[1].total - a[1].total)
                .slice(0, 20);
            
            topAuthors.forEach(([author, stats], index) => {
                console.log(`${index + 1}. ${author}: ${stats.total}개 작품`);
                console.log(`    완결: ${stats.completed}개, 연재중: ${stats.ongoing}개`);
                console.log(`    평균 평점: ${stats.avgRating}점 (${stats.ratedWorks}개 작품 기준)`);
                console.log('');
            });
            
            analysis.authorAnalysis = Object.fromEntries(topAuthors);

            // 7. 특별 순위 (TOP 10)
            console.log(`\n🏆 === 특별 순위 ===`);
            
            // 최고 평점 작품 (평점 9.0 이상)
            const highRatedNovels = validNovels
                .filter(novel => novel["평점"] && parseFloat(novel["평점"]) >= 9.0)
                .sort((a, b) => parseFloat(b["평점"]) - parseFloat(a["평점"]))
                .slice(0, 10);
            
            console.log(`\n🌟 최고 평점 작품 TOP 10 (9.0점 이상):`);
            highRatedNovels.forEach((novel, index) => {
                const status = this.normalizeStatus(novel["완결 여부"]);
                console.log(`${index + 1}. ${novel["제목"]} (${novel["작가명"]}) - ${novel["평점"]}점 [${status}]`);
            });
            
            // 최다 회차 작품
            const mostEpisodesNovels = validNovels
                .filter(novel => novel["API_총화수"] && novel["API_총화수"] > 0)
                .sort((a, b) => parseInt(b["API_총화수"]) - parseInt(a["API_총화수"]))
                .slice(0, 10);
            
            console.log(`\n📚 최다 회차 작품 TOP 10:`);
            mostEpisodesNovels.forEach((novel, index) => {
                const status = this.normalizeStatus(novel["완결 여부"]);
                console.log(`${index + 1}. ${novel["제목"]} (${novel["작가명"]}) - ${novel["API_총화수"]}화 [${status}]`);
            });
            
            // 최장 연재 기간 (연재중 작품)
            const longestSerializationNovels = ongoingNovels
                .map(novel => ({
                    ...novel,
                    serializationDays: this.calculateSerializationDays(novel["연재 시작일"])
                }))
                .filter(novel => novel.serializationDays)
                .sort((a, b) => b.serializationDays - a.serializationDays)
                .slice(0, 10);
            
            console.log(`\n⏰ 최장 연재 기간 작품 TOP 10 (연재중):`);
            longestSerializationNovels.forEach((novel, index) => {
                const years = (novel.serializationDays / 365).toFixed(1);
                console.log(`${index + 1}. ${novel["제목"]} (${novel["작가명"]}) - ${novel.serializationDays}일 (${years}년)`);
            });
            
            analysis.topLists = {
                highRatedNovels: highRatedNovels.slice(0, 10),
                mostEpisodesNovels: mostEpisodesNovels.slice(0, 10),
                longestSerializationNovels: longestSerializationNovels.slice(0, 10)
            };

            // 결과 저장
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const outputFile = `output/serialization_analysis_${timestamp}.json`;
            
            await fs.writeFile(outputFile, JSON.stringify(analysis, null, 2), 'utf8');
            
            console.log(`\n💾 === 분석 완료 ===`);
            console.log(`분석 결과 저장: ${outputFile}`);
            console.log(`분석 대상 작품: ${validNovels.length.toLocaleString()}개`);
            console.log(`연재중 작품: ${ongoingNovels.length.toLocaleString()}개`);
            console.log(`완결 작품: ${(statusStats['완결'] || 0).toLocaleString()}개`);
            
            return analysis;
            
        } catch (error) {
            console.error('❌ 분석 중 오류 발생:', error.message);
            throw error;
        }
    }
}

// 사용법
async function main() {
    const analyzer = new SerializationStatusAnalyzer();
    
    try {
        await analyzer.analyzeSerializationStatus();
        console.log('\n🎉 연재 상태 분석이 완료되었습니다!');
    } catch (error) {
        console.error('❌ 실행 중 오류:', error.message);
    }
}

// 스크립트 직접 실행 시
if (require.main === module) {
    main();
}

module.exports = SerializationStatusAnalyzer;