export const GST_PERCENT = 18;
export const EMI_MONTHS_LIST = [4, 6, 8, 15];

export function calculateFeeDetails(baseAmount, allowedPlans) {
  const originalBase = Math.max(0, Number(baseAmount) || 0);
  const originalGst = Math.round(originalBase * (GST_PERCENT / 100));
  const originalTotal = originalBase + originalGst;

  // 1. Cash Option: 15% Discount
  const cashDiscountPercent = 15;
  const cashDiscountAmount = Math.round(originalTotal * (cashDiscountPercent / 100));
  const cashTotal = originalTotal - cashDiscountAmount;
  const cashBase = Math.round(originalBase * (1 - cashDiscountPercent / 100));
  const cashGst = cashTotal - cashBase;

  const cash = {
    key: 'cash',
    label: 'Cash',
    fullName: 'Full Cash Payment (15% OFF)',
    months: 1,
    discountPercent: cashDiscountPercent,
    discountAmount: cashDiscountAmount,
    originalTotal,
    baseAmount: cashBase,
    gstAmount: cashGst,
    totalAmount: cashTotal,
    installmentAmount: cashTotal,
    installmentTotal: cashTotal,
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  };

  // 2. EMI Options:
  // - 4, 6, 8 EMI: 7% Discount
  // - 15 EMI (Total EMI): 0% Discount (No Discount)
  const allEmiPlans = EMI_MONTHS_LIST.map(months => {
    const isDiscounted = [4, 6, 8].includes(months);
    const discountPercent = isDiscounted ? 7 : 0;
    const discountAmount = Math.round(originalTotal * (discountPercent / 100));
    const totalWithDiscount = originalTotal - discountAmount;
    const baseWithDiscount = Math.round(originalBase * (1 - discountPercent / 100));
    const gstWithDiscount = totalWithDiscount - baseWithDiscount;

    const installmentTotal = Math.round(totalWithDiscount / months);
    const installmentBase = Math.round(baseWithDiscount / months);
    const installmentGst = installmentTotal - installmentBase;
    const originalInstallment = Math.round(originalTotal / months);

    return {
      key: `emi_${months}`,
      months,
      label: `${months} EMI`,
      fullName: `${months} Months EMI Plan${discountPercent > 0 ? ` (${discountPercent}% OFF)` : ' (Standard Total)'}`,
      discountPercent,
      discountAmount,
      originalTotal,
      originalInstallment,
      baseAmount: baseWithDiscount,
      gstAmount: gstWithDiscount,
      totalAmount: totalWithDiscount,
      installmentTotal,
      installmentBase,
      installmentGst,
      badgeClass:
        months === 4 ? 'bg-blue-50 text-blue-800 border-blue-300' :
        months === 6 ? 'bg-indigo-50 text-indigo-800 border-indigo-300' :
        months === 8 ? 'bg-purple-50 text-purple-800 border-purple-300' :
        'bg-amber-50 text-amber-800 border-amber-300',
    };
  });

  const emiOptions = allowedPlans && allowedPlans.length > 0
    ? allEmiPlans.filter(p => allowedPlans.includes(p.key) || allowedPlans.includes(String(p.months)))
    : allEmiPlans;

  return {
    base: originalBase,
    gst: originalGst,
    total: originalTotal,
    cash,
    allEmiPlans,
    emiOptions: emiOptions.length > 0 ? emiOptions : allEmiPlans,
  };
}

export function parseCoursePlans(description) {
  if (!description) return ['emi_4', 'emi_6', 'emi_8', 'emi_15'];
  const match = description.match(/\[emi_plans:([^\]]+)\]/);
  if (match && match[1]) {
    const list = match[1].split(',').filter(Boolean);
    if (list.length > 0) return list;
  }
  return ['emi_4', 'emi_6', 'emi_8', 'emi_15'];
}

export function stripPlansFromDesc(description) {
  if (!description) return '';
  return description.replace(/\[(plans|emi_plans):[^\]]+\]/g, '').trim();
}

/**
 * Safely parse payment plan JSON stored in invoice description
 */
export function parsePlanFromInvoice(invoice) {
  if (!invoice || !invoice.description) return null;
  try {
    const parsed = JSON.parse(invoice.description);
    if (parsed && (parsed.plan_key || parsed.plan_name || parsed.payment_type)) {
      return parsed;
    }
  } catch {
    // If not JSON, check for plan tag
    const match = invoice.description.match(/\[payment_plan:([^\]]+)\]/);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
  }
  return null;
}
