// costCalculator.js — calculates number of bags and total INR cost
// Given: fertilizer recommendation + farm size in acres

const calculateCost = (recommendations, farm_size_acres) => {
  const acres = farm_size_acres || 1; // default to 1 acre if not provided

  return recommendations.map((rec) => {
    const totalQtyKg = rec.qty_kg_per_acre * acres;
    const bagsNeeded = Math.ceil(totalQtyKg / rec.bag_size_kg); // round up
    const totalCost  = bagsNeeded * rec.price_per_bag;

    return {
      fertilizer:     rec.name,
      reason:         rec.reason,
      qty_per_acre:   `${rec.qty_kg_per_acre} kg`,
      total_qty:      `${totalQtyKg} kg`,
      bag_size:       `${rec.bag_size_kg} kg bag`,
      bags_needed:    bagsNeeded,
      price_per_bag:  `₹${rec.price_per_bag}`,
      total_cost:     totalCost,
      total_cost_inr: `₹${totalCost}`
    };
  });
};

// Sum up total cost of all fertilizers combined
const getTotalCost = (costBreakdown) => {
  return costBreakdown.reduce((sum, item) => sum + item.total_cost, 0);
};

module.exports = { calculateCost, getTotalCost };
