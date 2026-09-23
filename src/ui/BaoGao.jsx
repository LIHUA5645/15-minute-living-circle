// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，18
// 可视化报告：六维雷达图 + 设施覆盖对比柱状图（ECharts，浅色主题）
import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { BIAOZHUN } from '../core/poi/qingxi.js';

const MING = {
  yiliao: '医疗',
  jiaoyu: '教育',
  gouwu: '购物',
  yanglao: '养老',
  jiaotong: '交通',
  xiuxian: '休闲'
};
const AXIS = '#667085';
const LINE = '#e8ecf2';

export function BaoGao({ report }) {
  const rRef = useRef(null);
  const bRef = useRef(null);

  useEffect(() => {
    if (!report) return;
    const fps = report.fenleiPingfen;
    const names = fps.map(x => x.ming || MING[x.fenlei]);
    const scores = fps.map(x => x.score);

    const r = echarts.init(rRef.current);
    r.setOption({
      tooltip: {},
      radar: {
        indicator: names.map(n => ({ name: n, max: 100 })),
        axisName: { color: AXIS, fontSize: 12 },
        splitLine: { lineStyle: { color: LINE } },
        splitArea: { areaStyle: { color: ['#ffffff', '#f7f9fc'] } },
        axisLine: { lineStyle: { color: LINE } }
      },
      series: [
        {
          type: 'radar',
          data: [
            {
              value: scores,
              name: '服务能力',
              lineStyle: { color: '#2f9bff', width: 2 },
              itemStyle: { color: '#2f9bff' },
              areaStyle: { color: 'rgba(47,155,255,0.22)' }
            }
          ]
        }
      ]
    });

    const b = echarts.init(bRef.current);
    b.setOption({
      tooltip: { trigger: 'axis' },
      legend: {
        data: ['实际数量', '基准值'],
        textStyle: { color: AXIS },
        top: 0,
        itemWidth: 12,
        itemHeight: 8
      },
      grid: { left: 36, right: 12, top: 30, bottom: 24 },
      xAxis: {
        type: 'category',
        data: names,
        axisLabel: { color: AXIS, fontSize: 11 },
        axisLine: { lineStyle: { color: LINE } }
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: AXIS, fontSize: 11 },
        splitLine: { lineStyle: { color: LINE } }
      },
      series: [
        {
          name: '实际数量',
          type: 'bar',
          barWidth: 12,
          data: fps.map(x => x.shuliang),
          itemStyle: { color: '#2f9bff', borderRadius: [4, 4, 0, 0] }
        },
        {
          name: '基准值',
          type: 'bar',
          barWidth: 12,
          data: fps.map(x => BIAOZHUN[x.fenlei] || 3),
          itemStyle: { color: '#c6d8ee', borderRadius: [4, 4, 0, 0] }
        }
      ]
    });

    const onResize = () => {
      r.resize();
      b.resize();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [report]);

  if (!report) return null;
  return (
    <div className="report-block">
      <div className="chart-card">
        <div className="card-title">六维能力雷达</div>
        <div className="chart" ref={rRef} style={{ height: 210 }} />
      </div>
      <div className="chart-card">
        <div className="card-title">设施覆盖对比（实际 vs 基准）</div>
        <div className="chart" ref={bRef} style={{ height: 190 }} />
      </div>
    </div>
  );
}
