// validate.js — checks that soil input values are within realistic ranges
// Called before the advisor runs to reject bad/impossible data

const validateSoilInput = (data) => {
  const errors = [];

  const { ph, nitrogen, phosphorus, potassium, organic_carbon, zinc, sulfur, iron, crop, farm_size_acres } = data;

  // Load supported crops from rules
  const rules = require('./rules.json');
  const supportedCrops = Object.keys(rules.crops);

  // Crop check
  if (!crop) {
    errors.push('Crop is required');
  } else if (!supportedCrops.includes(crop.toLowerCase())) {
    errors.push(`Crop "${crop}" is not supported. Supported: ${supportedCrops.join(', ')}`);
  }

  // pH: must be between 0 and 14 (real soil is usually 4–9)
  if (ph === undefined || ph === null) {
    errors.push('pH is required');
  } else if (ph < 0 || ph > 14) {
    errors.push('pH must be between 0 and 14');
  }

  // Nitrogen: kg/ha — realistic range 0 to 600
  if (nitrogen === undefined || nitrogen === null) {
    errors.push('Nitrogen is required');
  } else if (nitrogen < 0 || nitrogen > 600) {
    errors.push('Nitrogen must be between 0 and 600 kg/ha');
  }

  // Phosphorus: kg/ha — realistic range 0 to 100
  if (phosphorus === undefined || phosphorus === null) {
    errors.push('Phosphorus is required');
  } else if (phosphorus < 0 || phosphorus > 100) {
    errors.push('Phosphorus must be between 0 and 100 kg/ha');
  }

  // Potassium: kg/ha — realistic range 0 to 800
  if (potassium === undefined || potassium === null) {
    errors.push('Potassium is required');
  } else if (potassium < 0 || potassium > 800) {
    errors.push('Potassium must be between 0 and 800 kg/ha');
  }

  // Organic Carbon: % — realistic range 0 to 5
  if (organic_carbon !== undefined && organic_carbon !== null) {
    if (organic_carbon < 0 || organic_carbon > 5) {
      errors.push('Organic Carbon must be between 0 and 5%');
    }
  }

  // Zinc: ppm — realistic range 0 to 20
  if (zinc !== undefined && zinc !== null) {
    if (zinc < 0 || zinc > 20) {
      errors.push('Zinc must be between 0 and 20 ppm');
    }
  }

  // Farm size
  if (farm_size_acres !== undefined && farm_size_acres !== null) {
    if (farm_size_acres <= 0 || farm_size_acres > 1000) {
      errors.push('Farm size must be between 0 and 1000 acres');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

module.exports = { validateSoilInput };
