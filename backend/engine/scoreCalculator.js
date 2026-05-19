// scoreCalculator.js — calculates a 0-100 soil health score
// Higher score = healthier soil

const calculateSoilScore = (soilData, cropRules) => {
  let score = 100;
  let deductions = [];

  const { ph, nitrogen, phosphorus, potassium, organic_carbon, zinc } = soilData;

  // pH check — deduct up to 20 points
  if (ph < cropRules.ph.min || ph > cropRules.ph.max) {
    const penalty = ph < cropRules.ph.min ? 20 : 15;
    score -= penalty;
    deductions.push({ factor: 'pH', issue: ph < cropRules.ph.min ? 'Too acidic' : 'Too alkaline', penalty });
  }

  // Nitrogen check — deduct up to 20 points
  if (nitrogen < cropRules.nitrogen.low) {
    score -= 20;
    deductions.push({ factor: 'Nitrogen', issue: 'Very low', penalty: 20 });
  } else if (nitrogen < cropRules.nitrogen.medium) {
    score -= 10;
    deductions.push({ factor: 'Nitrogen', issue: 'Medium — could be better', penalty: 10 });
  }

  // Phosphorus check — deduct up to 20 points
  if (phosphorus < cropRules.phosphorus.low) {
    score -= 20;
    deductions.push({ factor: 'Phosphorus', issue: 'Very low', penalty: 20 });
  } else if (phosphorus < cropRules.phosphorus.medium) {
    score -= 10;
    deductions.push({ factor: 'Phosphorus', issue: 'Medium', penalty: 10 });
  }

  // Potassium check — deduct up to 15 points
  if (potassium < cropRules.potassium.low) {
    score -= 15;
    deductions.push({ factor: 'Potassium', issue: 'Very low', penalty: 15 });
  } else if (potassium < cropRules.potassium.medium) {
    score -= 7;
    deductions.push({ factor: 'Potassium', issue: 'Medium', penalty: 7 });
  }

  // Organic Carbon check — deduct up to 15 points
  if (organic_carbon !== null && organic_carbon !== undefined) {
    if (organic_carbon < cropRules.organic_carbon.low) {
      score -= 15;
      deductions.push({ factor: 'Organic Carbon', issue: 'Very low — soil structure poor', penalty: 15 });
    } else if (organic_carbon < cropRules.organic_carbon.medium) {
      score -= 7;
      deductions.push({ factor: 'Organic Carbon', issue: 'Medium', penalty: 7 });
    }
  }

  // Zinc check — deduct up to 10 points
  if (zinc !== null && zinc !== undefined) {
    if (zinc < cropRules.zinc.deficient) {
      score -= 10;
      deductions.push({ factor: 'Zinc', issue: 'Deficient', penalty: 10 });
    }
  }

  // Sulfur check — deduct 5 points
  if (soilData.sulfur !== null && soilData.sulfur !== undefined) {
    if (soilData.sulfur < cropRules.sulfur.deficient) {
      score -= 5;
      deductions.push({ factor: 'Sulfur', issue: 'Deficient', penalty: 5 });
    }
  }

  // Iron check — deduct 5 points
  if (soilData.iron !== null && soilData.iron !== undefined) {
    if (soilData.iron < cropRules.iron.deficient) {
      score -= 5;
      deductions.push({ factor: 'Iron', issue: 'Deficient', penalty: 5 });
    }
  }

  // Score cannot go below 0
  score = Math.max(0, score);


  // Score label
  let label;
  if (score >= 80)      label = 'Excellent';
  else if (score >= 60) label = 'Good';
  else if (score >= 40) label = 'Fair';
  else                  label = 'Poor';

  return { score, label, deductions };
};

module.exports = { calculateSoilScore };
