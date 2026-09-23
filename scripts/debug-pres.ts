import { cleanAuthorName, normalizeArabicNameString, isValidArabicPersonName } from '../server/utils/authorExtractor';

const presentationText = '\uFE97\uFE83\uFEDF\uFEF4\uFEBB : \u0627\u0644\u062F\u0643\u062A\u0648\u0631 \u0645\u062D\u0645\u062F \u0627\u0644\u0637\u0627\u0647\u0631';
let norm = normalizeArabicNameString(presentationText).replace(/تأليص/g, 'تأليف');
console.log('Norm with fix:', norm);

const pat = /(?:تصنيف|تأليف|المصنف|المؤلف|بقلم|صنعه|أدعية\s+الشيخ)\s*[:/؛\-]?\s*([^\n\r]+?)(?=(?:تحقيق|دراسة|طبعة|دار|مكتبة|العام|$))/i;
const m = norm.match(pat);
console.log('Match:', m);
if (m) {
  console.log('Cleaned:', cleanAuthorName(m[1]));
}
