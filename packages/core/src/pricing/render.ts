import { formatMinor, normalizeDigits } from './decimal.ts';
import type { Assessment } from './model.ts';

export function renderReply(assessment: Assessment, faq: string[]): string {
  const { request, quote } = assessment;
  const arabic = request.language !== 'English';
  if (assessment.disposition === 'hand_off')
    return arabic
      ? 'شكرًا لتواصلكم. طلبكم يحتاج إلى مراجعة فريقنا قبل تقديم عرض أو تأكيد التوفر والتوصيل. سنحيل الطلب إلى المسؤول المختص.'
      : 'Thanks for your request. Our team must review it before we can quote or confirm availability and delivery. We will hand this to the responsible person.';
  const faqReply = request.faqIndex === null ? undefined : faq[request.faqIndex];
  if (request.intent === 'faq' && !arabic && faqReply) return faqReply;
  const currencyAmount = quote ? `${quote.currency} ${formatMinor(quote.totalMinor)}` : '';
  const price = quote
    ? arabic
      ? `التقدير ${quote.complete ? '' : 'الجزئي '}هو ⁦${currencyAmount}⁩ شامل ضريبة القيمة المضافة ${quote.vatPercent}٪.`
      : `The ${quote.complete ? '' : 'partial '}estimate is ${currencyAmount} including ${quote.vatPercent}% VAT.`
    : arabic
      ? 'نحتاج إلى تفاصيل إضافية قبل تقديم السعر.'
      : 'We need more details before providing a price.';
  const arabicFields: Record<string, string> = {
    'Service / delivery location': 'الموقع',
    'Delivery or collection arrangement': 'الاستلام أو التوصيل',
    'Number of delivery / collection trips': 'عدد رحلات التوصيل والاستلام',
    'Event dates': 'تاريخ الفعالية',
    'Screen size and specification': 'حجم الشاشة ومواصفاتها',
    'Product and quantity': 'المنتج والكمية',
  };
  const missing = assessment.missing.length
    ? arabic
      ? `يرجى تأكيد: ${[...new Set(assessment.missing.map((field) => arabicFields[field] ?? arabicClarification(field)))].join('، ')}.`
      : `Please confirm: ${assessment.missing.join('; ')}.`
    : '';
  const overBudget =
    quote && request.budgetMinor !== null && quote.totalMinor > request.budgetMinor;
  const budget =
    overBudget && request.budgetMinor !== null
      ? arabic
        ? `هذا أعلى من ميزانيتكم البالغة ⁦${quote.currency} ${formatMinor(request.budgetMinor)}⁩. هل ترغبون بمراجعة الحجم أو الكمية أو المدة؟`
        : `This exceeds your budget of ${quote.currency} ${formatMinor(request.budgetMinor)}. Would you like to review the size, quantity or duration?`
      : '';
  const availability = arabic
    ? 'التوفر والمواعيد غير مؤكدة وتحتاج إلى مراجعة فريقنا.'
    : 'Availability and scheduling are unconfirmed and require our team’s review.';
  const discount = assessment.reasons.some((r) => r.code === 'discount_unspecified')
    ? arabic
      ? 'لم يُطبق أي خصم؛ طلبكم لسعر أفضل سيُراجع من المسؤول.'
      : 'No discount has been applied; a person will review your request for a better price.'
    : '';
  const exclusions =
    quote && !quote.complete
      ? arabic
        ? 'التكاليف أو المنتجات غير المحددة ليست ضمن هذا التقدير.'
        : 'Unresolved items or fees are excluded from this estimate.'
      : '';
  return [
    arabic ? 'شكرًا لتواصلكم.' : 'Thanks for your request.',
    price,
    exclusions,
    budget,
    discount,
    missing,
    availability,
  ]
    .filter(Boolean)
    .join(' ');
}

function arabicClarification(field: string) {
  const question = field.toLowerCase();
  if (question.includes('date')) return 'تاريخ الفعالية';
  if (/duration|rental.*days|rental.*months|how many months|how many.*days/.test(question))
    return 'مدة الإيجار';
  if (/trip/.test(question)) return 'عدد رحلات التوصيل والاستلام';
  if (/delivery|collection/.test(question)) return 'الاستلام أو التوصيل';
  if (/screen|dimension|size/.test(question)) return 'الحجم والمواصفات';
  if (/catalogue match:|model|specification|catalogued/.test(question))
    return 'نوع المنتج ومواصفاته';
  if (/quantity:|quantity|how many|number of/.test(question)) return 'الكمية المطلوبة';
  if (question.startsWith('rental duration:')) return 'مدة الإيجار';
  return 'تفاصيل الطلب الإضافية';
}

// Conservative edit check: commercial numbers cannot be changed through free text.
// Named humans may edit wording; changing quantities/rates requires a new structured assessment.
export function sameCommercialFacts(original: string, reply: string) {
  const numbers = (value: string) =>
    normalizeDigits(value.normalize('NFKC'))
      .replaceAll(',', '')
      .replaceAll('٬', '')
      .match(/\d+(?:\.\d+)?/g) ?? [];
  const currencies = (value: string) =>
    value.toUpperCase().match(/\b(?:AED|SAR|USD|EUR|GBP)\b/g) ?? [];
  return (
    JSON.stringify(numbers(original)) === JSON.stringify(numbers(reply)) &&
    JSON.stringify(currencies(original)) === JSON.stringify(currencies(reply))
  );
}
