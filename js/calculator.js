/* 愈见 App - pH/UA 计算公式（从网页版迁移） */

const Calculator = {
  // ===== pH 计算 =====
  calculatePH(voltage, temperature) {
    const E_volt = voltage / 1000;
    let pH, formula;

    if (temperature === 15) {
      pH = (0.35816 - E_volt) / 0.05239;
      formula = "15℃: pH = (0.35816 - E) / 0.05239 (R²=0.99255)";
    } else if (temperature === 20) {
      pH = (0.33863 - E_volt) / 0.05474;
      formula = "20℃: pH = (0.33863 - E) / 0.05474 (R²=0.99837)";
    } else if (temperature >= 25 && temperature <= 30) {
      pH = (0.3703 - E_volt) / 0.05989;
      formula = "25-30℃: pH = (0.3703 - E) / 0.05989 (R²=0.97607)";
    } else if (temperature === 35) {
      pH = (0.32251 - E_volt) / 0.05127;
      formula = "35℃: pH = (0.32251 - E) / 0.05127 (R²=0.99896)";
    } else if (temperature > 15 && temperature < 20) {
      const ratio = (temperature - 15) / 5;
      const intercept = 0.35816 + ratio * (0.33863 - 0.35816);
      const slope = 0.05239 + ratio * (0.05474 - 0.05239);
      pH = (intercept - E_volt) / slope;
      formula = `${temperature.toFixed(1)}℃: 插值计算（15-20℃区间）`;
    } else if (temperature > 20 && temperature < 25) {
      const ratio = (temperature - 20) / 5;
      const intercept = 0.33863 + ratio * (0.3703 - 0.33863);
      const slope = 0.05474 + ratio * (0.05989 - 0.05474);
      pH = (intercept - E_volt) / slope;
      formula = `${temperature.toFixed(1)}℃: 插值计算（20-25℃区间）`;
    } else if (temperature > 30 && temperature < 35) {
      const ratio = (temperature - 30) / 5;
      const intercept = 0.3703 + ratio * (0.32251 - 0.3703);
      const slope = 0.05989 + ratio * (0.05127 - 0.05989);
      pH = (intercept - E_volt) / slope;
      formula = `${temperature.toFixed(1)}℃: 插值计算（30-35℃区间）`;
    } else {
      return { valid: false, message: `温度${temperature}℃超出有效范围（15-35℃）` };
    }

    return {
      valid: true,
      pHValue: parseFloat(pH.toFixed(2)),
      formula,
      voltage,
      temperature
    };
  },

  // pH 风险分析
  analyzePHRisk(result) {
    if (!result.valid) return { status: '错误', color: 'danger', risk: '无法分析', harm: result.message, suggestion: '请输入15-35℃范围内的温度值' };
    const ph = result.pHValue;
    if (ph < 6.5) return {
      status: '偏低', color: 'danger', risk: '高风险',
      harm: '酸性过强会抑制成纤维细胞增殖，破坏细胞外基质，增加感染概率。',
      suggestion: '建议使用弱碱性敷料调节pH，增加伤口清洁频率至每日2次，必要时使用抗菌药物。'
    };
    if (ph > 7.8) return {
      status: '偏高', color: 'warning', risk: '中风险',
      harm: '碱性过强会影响酶活性，可能导致组织自溶性坏死，延长愈合时间。',
      suggestion: '建议使用弱酸性敷料平衡pH，保持伤口湿润环境，密切观察组织颜色变化。'
    };
    return {
      status: '正常', color: 'success', risk: '低风险',
      harm: 'pH值在正常范围（6.5-7.8），有利于细胞增殖和伤口愈合。',
      suggestion: '维持当前护理方案，继续保持伤口清洁与湿润，定期监测pH变化。'
    };
  },

  // ===== 尿酸计算 =====
  calculateUA(current, temperature) {
    let ua, formula;

    if (temperature === 15) {
      ua = (current - 1.87396) / 0.0027;
      formula = "15℃: n = (I - 1.87396) / 0.0027 (R²=0.98416)";
    } else if (temperature === 20) {
      ua = (current - 1.93215) / 0.00306;
      formula = "20℃: n = (I - 1.93215) / 0.00306 (R²=0.9875)";
    } else if (temperature === 25) {
      ua = (current - 2.07405) / 0.00313;
      formula = "25℃: n = (I - 2.07405) / 0.00313 (R²=0.99265)";
    } else if (temperature === 30) {
      ua = (current - 2.10066) / 0.00324;
      formula = "30℃: n = (I - 2.10066) / 0.00324 (R²=0.99002)";
    } else if (temperature > 15 && temperature < 20) {
      const ratio = (temperature - 15) / 5;
      const intercept = 1.87396 + ratio * (1.93215 - 1.87396);
      const slope = 0.0027 + ratio * (0.00306 - 0.0027);
      ua = (current - intercept) / slope;
      formula = `${temperature.toFixed(1)}℃: 插值计算（15-20℃区间）`;
    } else if (temperature > 20 && temperature < 25) {
      const ratio = (temperature - 20) / 5;
      const intercept = 1.93215 + ratio * (2.07405 - 1.93215);
      const slope = 0.00306 + ratio * (0.00313 - 0.00306);
      ua = (current - intercept) / slope;
      formula = `${temperature.toFixed(1)}℃: 插值计算（20-25℃区间）`;
    } else if (temperature > 25 && temperature < 30) {
      const ratio = (temperature - 25) / 5;
      const intercept = 2.07405 + ratio * (2.10066 - 2.07405);
      const slope = 0.00313 + ratio * (0.00324 - 0.00313);
      ua = (current - intercept) / slope;
      formula = `${temperature.toFixed(1)}℃: 插值计算（25-30℃区间）`;
    } else {
      return { valid: false, message: `温度${temperature}℃超出有效范围（15-30℃）` };
    }

    return {
      valid: true,
      uaValue: parseFloat(ua.toFixed(1)),
      formula,
      current,
      temperature
    };
  },

  // 尿酸风险分析
  analyzeUARisk(result) {
    if (!result.valid) return { status: '错误', color: 'danger', risk: '无法分析', harm: result.message, suggestion: '请输入15-30℃范围内的温度值' };
    const ua = result.uaValue;
    if (ua < 150) return {
      status: '偏低', color: 'warning', risk: '中风险',
      harm: '尿酸浓度偏低可能提示组织代谢减缓，影响伤口愈合所需的能量供应。',
      suggestion: '建议增加局部营养支持，监测组织氧合情况，考虑使用促进代谢的敷料。'
    };
    if (ua > 416) return {
      status: '偏高', color: 'danger', risk: '高风险',
      harm: '尿酸浓度过高可能导致结晶沉积，引起局部炎症反应加重，阻碍肉芽组织形成。',
      suggestion: '建议增加伤口冲洗频率，使用碱性敷料调节微环境，必要时进行尿酸降低治疗。'
    };
    return {
      status: '正常', color: 'success', risk: '低风险',
      harm: '尿酸浓度在正常范围（150-416μM），表明组织代谢状况良好。',
      suggestion: '维持当前护理方案，继续保持伤口清洁与适宜湿度，定期监测尿酸水平变化。'
    };
  }
};
