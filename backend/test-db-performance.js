#!/usr/bin/env node

/**
 * 数据库性能测试脚本
 * 测试数据库优化后的性能表现
 */

import databaseService from './services/databaseService.js';
import { performance } from 'perf_hooks';

const TEST_CONFIG = {
  BATCH_SIZES: [1, 10, 50, 100],
  PAGINATION_SIZES: [10, 20, 50],
  SEARCH_TERMS: ['test', 'product', 'specification', 'optimization'],
  CONCURRENT_REQUESTS: 10
};

class DatabasePerformanceTest {
  constructor() {
    this.results = {
      initialization: null,
      batchOperations: [],
      paginationTests: [],
      searchTests: [],
      concurrencyTests: [],
      summary: {}
    };
  }

  async initialize() {
    console.log('🚀 Starting Database Performance Tests');
    console.log('=====================================\n');

    const startTime = performance.now();
    try {
      await databaseService.initialize();
      this.results.initialization = {
        success: true,
        duration: performance.now() - startTime,
        message: 'Database initialized successfully'
      };
      console.log(`✅ Database initialized in ${this.results.initialization.duration.toFixed(2)}ms\n`);
    } catch (error) {
      this.results.initialization = {
        success: false,
        duration: performance.now() - startTime,
        error: error.message
      };
      console.error(`❌ Database initialization failed: ${error.message}\n`);
      throw error;
    }
  }

  async testBatchOperations() {
    console.log('📊 Testing Batch Operations Performance');
    console.log('=======================================');

    for (const batchSize of TEST_CONFIG.BATCH_SIZES) {
      const testData = this.generateTestData(batchSize);
      
      // 测试批量插入性能
      const insertStartTime = performance.now();
      const insertedSpecs = [];
      
      try {
        for (const data of testData) {
          const id = await databaseService.createIdea(data.userInput, data.generatedSpec, 'completed');
          insertedSpecs.push(id);
        }
        
        const insertDuration = performance.now() - insertStartTime;
        
        // 测试批量删除性能
        const deleteStartTime = performance.now();
        const deleteResult = await databaseService.batchDeleteSpecs(insertedSpecs);
        const deleteDuration = performance.now() - deleteStartTime;
        
        const result = {
          batchSize,
          insertDuration,
          deleteDuration,
          insertThroughput: (batchSize / insertDuration * 1000).toFixed(2),
          deleteThroughput: (deleteResult.deletedCount / deleteDuration * 1000).toFixed(2),
          deleteSuccess: deleteResult.deletedCount === insertedSpecs.length
        };
        
        this.results.batchOperations.push(result);
        
        console.log(`  📝 Batch size ${batchSize}:`);
        console.log(`     Insert: ${insertDuration.toFixed(2)}ms (${result.insertThroughput} ops/sec)`);
        console.log(`     Delete: ${deleteDuration.toFixed(2)}ms (${result.deleteThroughput} ops/sec)`);
        console.log(`     Success: ${result.deleteSuccess ? '✅' : '❌'}\n`);
        
      } catch (error) {
        console.error(`  ❌ Batch test failed for size ${batchSize}: ${error.message}\n`);
        this.results.batchOperations.push({
          batchSize,
          error: error.message,
          success: false
        });
      }
    }
  }

  async testPaginationPerformance() {
    console.log('📄 Testing Pagination Performance');
    console.log('=================================');

    // 创建测试数据
    const testDataCount = 500;
    const testIds = [];
    
    try {
      console.log(`  📝 Creating ${testDataCount} test records...`);
      const createStartTime = performance.now();
      
      for (let i = 0; i < testDataCount; i++) {
        const id = await databaseService.createIdea(`Test idea ${i}`, `Generated spec ${i}`, 'completed');
        testIds.push(id);
      }
      
      const createDuration = performance.now() - createStartTime;
      console.log(`  ✅ Created ${testDataCount} records in ${createDuration.toFixed(2)}ms\n`);

      // 测试不同分页大小的性能
      for (const pageSize of TEST_CONFIG.PAGINATION_SIZES) {
        const totalPages = Math.ceil(testDataCount / pageSize);
        const testPages = Math.min(5, totalPages); // 测试前5页
        
        const pageStartTime = performance.now();
        
        for (let page = 1; page <= testPages; page++) {
          await databaseService.getHistory(page, pageSize);
        }
        
        const pageDuration = performance.now() - pageStartTime;
        const avgPageTime = pageDuration / testPages;
        
        const result = {
          pageSize,
          totalPages,
          testedPages: testPages,
          totalDuration: pageDuration,
          avgPageTime,
          throughput: (testPages / pageDuration * 1000).toFixed(2)
        };
        
        this.results.paginationTests.push(result);
        
        console.log(`  📄 Page size ${pageSize}:`);
        console.log(`     Tested ${testPages} pages in ${pageDuration.toFixed(2)}ms`);
        console.log(`     Average: ${avgPageTime.toFixed(2)}ms/page (${result.throughput} pages/sec)\n`);
      }

      // 清理测试数据
      console.log('  🧹 Cleaning up test data...');
      const cleanupResult = await databaseService.batchDeleteSpecs(testIds);
      console.log(`  ✅ Cleaned up ${cleanupResult.deletedCount} records\n`);
      
    } catch (error) {
      console.error(`  ❌ Pagination test failed: ${error.message}\n`);
      
      // 尝试清理
      if (testIds.length > 0) {
        try {
          await databaseService.batchDeleteSpecs(testIds);
        } catch (cleanupError) {
          console.error(`  ⚠️  Cleanup failed: ${cleanupError.message}`);
        }
      }
    }
  }

  async testSearchPerformance() {
    console.log('🔍 Testing Search Performance');
    console.log('=============================');

    // 创建带有不同内容的测试数据
    const searchTestData = [];
    for (let i = 0; i < 100; i++) {
      const randomTerm = TEST_CONFIG.SEARCH_TERMS[i % TEST_CONFIG.SEARCH_TERMS.length];
      searchTestData.push({
        userInput: `${randomTerm} input ${i}`,
        generatedSpec: `Generated ${randomTerm} specification ${i}`,
        status: 'completed'
      });
    }

    const testIds = [];
    
    try {
      // 创建测试数据
      for (const data of searchTestData) {
        const id = await databaseService.createIdea(data.userInput, data.generatedSpec, data.status);
        testIds.push(id);
      }

      // 测试搜索性能
      for (const searchTerm of TEST_CONFIG.SEARCH_TERMS) {
        const searchStartTime = performance.now();
        const searchResult = await databaseService.getHistory(1, 20, searchTerm);
        const searchDuration = performance.now() - searchStartTime;
        
        const result = {
          searchTerm,
          duration: searchDuration,
          resultCount: searchResult.data.length,
          totalFound: searchResult.pagination.total
        };
        
        this.results.searchTests.push(result);
        
        console.log(`  🔍 Search "${searchTerm}":`);
        console.log(`     Duration: ${searchDuration.toFixed(2)}ms`);
        console.log(`     Results: ${result.resultCount}/${result.totalFound}\n`);
      }

      // 清理测试数据
      await databaseService.batchDeleteSpecs(testIds);
      
    } catch (error) {
      console.error(`  ❌ Search test failed: ${error.message}\n`);
      
      // 尝试清理
      if (testIds.length > 0) {
        try {
          await databaseService.batchDeleteSpecs(testIds);
        } catch (cleanupError) {
          console.error(`  ⚠️  Cleanup failed: ${cleanupError.message}`);
        }
      }
    }
  }

  async testConcurrentOperations() {
    console.log('⚡ Testing Concurrent Operations');
    console.log('===============================');

    const concurrentOps = [];
    const startTime = performance.now();

    try {
      // 创建并发操作
      for (let i = 0; i < TEST_CONFIG.CONCURRENT_REQUESTS; i++) {
        concurrentOps.push(
          databaseService.getHistory(1, 10).then(result => ({
            index: i,
            success: true,
            resultCount: result.data.length,
            duration: null // 无法准确测量单个操作时间
          })).catch(error => ({
            index: i,
            success: false,
            error: error.message
          }))
        );
      }

      const results = await Promise.all(concurrentOps);
      const totalDuration = performance.now() - startTime;
      
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;
      
      const concurrentResult = {
        totalOperations: TEST_CONFIG.CONCURRENT_REQUESTS,
        successCount,
        failureCount,
        totalDuration,
        avgDuration: totalDuration / TEST_CONFIG.CONCURRENT_REQUESTS,
        throughput: (TEST_CONFIG.CONCURRENT_REQUESTS / totalDuration * 1000).toFixed(2)
      };
      
      this.results.concurrencyTests.push(concurrentResult);
      
      console.log(`  ⚡ Concurrent Operations:`);
      console.log(`     Total: ${concurrentResult.totalOperations}`);
      console.log(`     Success: ${successCount} | Failed: ${failureCount}`);
      console.log(`     Duration: ${totalDuration.toFixed(2)}ms`);
      console.log(`     Throughput: ${concurrentResult.throughput} ops/sec\n`);
      
    } catch (error) {
      console.error(`  ❌ Concurrency test failed: ${error.message}\n`);
    }
  }

  generateTestData(count) {
    const data = [];
    for (let i = 0; i < count; i++) {
      data.push({
        userInput: `Test user input ${i} - ${Date.now()}`,
        generatedSpec: `Generated specification ${i} with detailed content and multiple lines to test performance with realistic data sizes. This includes various technical requirements and implementation details.`,
        status: 'completed'
      });
    }
    return data;
  }

  async generateSummary() {
    try {
      const dbStats = await databaseService.getStats();
      const performanceStats = await databaseService.getPerformanceStats(1);
      
      this.results.summary = {
        databaseStats: dbStats,
        performanceStats: performanceStats.slice(0, 5), // 前5个端点
        recommendations: this.generateRecommendations()
      };
    } catch (error) {
      console.error('⚠️  Failed to generate summary:', error.message);
      this.results.summary = {
        error: error.message,
        recommendations: this.generateRecommendations()
      };
    }
  }

  generateRecommendations() {
    const recommendations = [];
    
    // 基于测试结果生成建议
    if (this.results.batchOperations.length > 0) {
      const avgBatchPerf = this.results.batchOperations
        .filter(r => r.success !== false)
        .reduce((sum, r) => sum + parseFloat(r.insertThroughput), 0) / 
        this.results.batchOperations.filter(r => r.success !== false).length;
      
      if (avgBatchPerf > 100) {
        recommendations.push('✅ Batch operations are performing well (>100 ops/sec)');
      } else {
        recommendations.push('⚠️  Consider optimizing batch operations for better throughput');
      }
    }
    
    if (this.results.paginationTests.length > 0) {
      const avgPaginationTime = this.results.paginationTests
        .reduce((sum, r) => sum + r.avgPageTime, 0) / this.results.paginationTests.length;
      
      if (avgPaginationTime < 50) {
        recommendations.push('✅ Pagination performance is excellent (<50ms/page)');
      } else if (avgPaginationTime < 100) {
        recommendations.push('⚠️  Pagination performance is acceptable but could be improved');
      } else {
        recommendations.push('❌ Pagination performance needs optimization (>100ms/page)');
      }
    }
    
    if (this.results.searchTests.length > 0) {
      const avgSearchTime = this.results.searchTests
        .reduce((sum, r) => sum + r.duration, 0) / this.results.searchTests.length;
      
      if (avgSearchTime < 100) {
        recommendations.push('✅ Search performance is good (<100ms)');
      } else {
        recommendations.push('⚠️  Consider adding full-text search indexes for better search performance');
      }
    }
    
    return recommendations;
  }

  printResults() {
    console.log('\n📊 PERFORMANCE TEST RESULTS');
    console.log('===========================\n');

    // 打印摘要
    if (this.results.summary.recommendations) {
      console.log('💡 Recommendations:');
      this.results.summary.recommendations.forEach(rec => {
        console.log(`  ${rec}`);
      });
      console.log();
    }

    // 打印数据库统计
    if (this.results.summary.databaseStats) {
      const stats = this.results.summary.databaseStats;
      console.log('📈 Database Statistics:');
      console.log(`  Total Ideas: ${stats.totalIdeas}`);
      console.log(`  Recent Ideas (24h): ${stats.recentIdeas}`);
      console.log(`  Total Queries: ${stats.queryMetrics.totalQueries}`);
      console.log(`  Slow Queries: ${stats.queryMetrics.slowQueries}`);
      console.log(`  Avg Response Time: ${stats.queryMetrics.averageResponseTime.toFixed(2)}ms`);
      console.log(`  Cache Hit Rate: ${stats.cacheStats.cacheHitRate}%`);
      console.log();
    }

    console.log('🎯 Test completed successfully!');
  }

  async run() {
    try {
      await this.initialize();
      await this.testBatchOperations();
      await this.testPaginationPerformance();
      await this.testSearchPerformance();
      await this.testConcurrentOperations();
      await this.generateSummary();
      this.printResults();
    } catch (error) {
      console.error('❌ Performance test failed:', error.message);
      process.exit(1);
    } finally {
      await databaseService.close();
    }
  }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new DatabasePerformanceTest();
  test.run().catch(console.error);
}

export default DatabasePerformanceTest;