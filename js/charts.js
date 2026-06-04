/* 愈见 App - Chart.js 图表管理 */

const Charts = {
  _instances: {},

  destroy(key) {
    if (this._instances[key]) {
      this._instances[key].destroy();
      delete this._instances[key];
    }
  },

  destroyAll() {
    Object.keys(this._instances).forEach(k => this.destroy(k));
  },

  // 监测趋势图（双Y轴：pH + 尿酸）
  initTrendChart(canvasId, records) {
    this.destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const sorted = [...records].sort((a, b) => new Date(a.date) - new Date(b.date));
    this._instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: sorted.map(r => Utils.formatDateShort(r.date)),
        datasets: [
          {
            label: 'pH值',
            data: sorted.map(r => r.ph),
            borderColor: '#4F6EF7',
            backgroundColor: 'rgba(79,110,247,0.08)',
            borderWidth: 2.5,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: '#4F6EF7',
            yAxisID: 'y'
          },
          {
            label: '尿酸(μM)',
            data: sorted.map(r => r.uricAcid),
            borderColor: '#10B981',
            backgroundColor: 'rgba(16,185,129,0.08)',
            borderWidth: 2.5,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: '#10B981',
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { usePointStyle: true, padding: 20, font: { size: 12 } }
          }
        },
        scales: {
          y: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: 'pH值', font: { size: 11 } },
            min: 4, max: 9,
            grid: { color: '#F1F5F9' }
          },
          y1: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: '尿酸(μM)', font: { size: 11 } },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });
  },

  // 综合报告图
  initReportChart(canvasId, records) {
    this.destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx || !records.length) return;

    const sorted = [...records].sort((a, b) => new Date(a.date) - new Date(b.date));
    this._instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: sorted.map(r => Utils.formatDateShort(r.date)),
        datasets: [
          {
            label: 'pH值',
            data: sorted.map(r => r.ph),
            borderColor: '#4F6EF7',
            backgroundColor: 'rgba(79,110,247,0.1)',
            borderWidth: 2,
            tension: 0.3,
            yAxisID: 'y',
            fill: true
          },
          {
            label: '尿酸(μM)',
            data: sorted.map(r => r.uricAcid),
            borderColor: '#10B981',
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.3,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16 } }
        },
        scales: {
          y: {
            position: 'left',
            title: { display: true, text: 'pH值' },
            min: 4, max: 9
          },
          y1: {
            position: 'right',
            title: { display: true, text: '尿酸(μM)' },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });
  }
};
