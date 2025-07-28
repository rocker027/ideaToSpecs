#!/usr/bin/env node

/**
 * 数据库升级脚本
 * 应用性能优化到现有数据库
 */

import databaseService from './services/databaseService.js';

console.log('🚀 开始数据库性能升级...');
console.log('================================');

try {
  // 初始化数据库服务（包含所有优化）
  console.log('📋 初始化数据库服务...');
  await databaseService.initialize();
  console.log('✅ 数据库服务初始化完成');

  // 执行维护操作
  console.log('🔧 执行数据库维护...');
  await databaseService.performMaintenance();
  console.log('✅ 数据库维护完成');

  // 获取升级后的统计信息
  console.log('📊 获取性能统计...');
  const stats = await databaseService.getStats();
  const dbInfo = await databaseService.getDatabaseInfo();

  console.log('\n📈 升级后的数据库统计:');
  console.log(`   总Ideas数: ${stats.totalIdeas}`);
  console.log(`   总性能指标: ${stats.totalMetrics}`);
  console.log(`   最近24小时Ideas: ${stats.recentIdeas}`);
  console.log(`   数据库表数: ${dbInfo.tables.length}`);
  console.log(`   数据库索引数: ${dbInfo.indexes.length}`);
  
  if (stats.queryMetrics) {
    console.log(`   总查询数: ${stats.queryMetrics.totalQueries}`);
    console.log(`   慢查询数: ${stats.queryMetrics.slowQueries}`);
    console.log(`   平均响应时间: ${stats.queryMetrics.averageResponseTime.toFixed(2)}ms`);
  }

  if (stats.cacheStats) {
    console.log(`   缓存大小: ${stats.cacheStats.cacheSize}`);
    console.log(`   缓存命中率: ${stats.cacheStats.cacheHitRate}%`);
  }

  console.log('\n🎯 性能优化特性:');
  console.log('   ✅ 复合索引优化');
  console.log('   ✅ 预备语句缓存');
  console.log('   ✅ 查询性能监控');
  console.log('   ✅ 智能查询缓存');
  console.log('   ✅ 批量操作支持');
  console.log('   ✅ 连接池管理');
  console.log('   ✅ 自动维护机制');

  console.log('\n🔗 新增API端点:');
  console.log('   GET /api/history/performance - 数据库性能统计');
  console.log('   DELETE /api/history/bulk - 优化的批量删除');

  // 关闭数据库连接
  await databaseService.close();
  
  console.log('\n🎉 数据库性能升级完成！');
  console.log('================================');
  console.log('🚀 服务器现在可以享受显著的性能提升');
  console.log('📊 建议访问 /api/history/performance 查看详细性能指标');

} catch (error) {
  console.error('\n❌ 数据库升级失败:', error.message);
  console.error('🔧 请检查数据库连接和配置');
  process.exit(1);
}