import fs from 'fs';
import path from 'path';
import { normalizeArabicForSearch } from '../server/utils/authorExtractor';

export function classifyBookStrict(
  title: string,
  author: string,
  filename: string,
  categories: any[],
  introText?: string | null
): { categoryId: string; categoryName: string; confidence: number } {
  const normTitle = normalizeArabicForSearch(title || '');
  const normAuthor = normalizeArabicForSearch(author || '');
  const normFilename = normalizeArabicForSearch(filename || '');
  const normIntro = normalizeArabicForSearch(introText || '');
  const fullText = `${normTitle} ${normAuthor} ${normFilename} ${normIntro}`;

  // 1. Absolute Institutional & Explicit Topic Overrides (Highest Precision)
  if (
    normIntro.includes('كليه العلوم الشرعيه') ||
    normIntro.includes('الفقه واصوله') ||
    normIntro.includes('دراسه فقهيه') ||
    normTitle.includes('في الفقه الاسلامي') ||
    normTitle.includes('يف الفقه اإلسالمي') ||
    normTitle.includes('في الشريعه الاسلاميه') ||
    normTitle.includes('احكامه يف الشريعه') ||
    normTitle.includes('احكامه في الشريعه') ||
    normTitle.includes('فقه الامامه') ||
    normTitle.includes('بفقه الامامه') ||
    normTitle.includes('جوهر النظام') ||
    normTitle.includes('عقيده المسلم') ||
    normTitle.includes('الايمان بالغيب') ||
    normTitle.includes('خطوات للحج') ||
    normTitle.includes('للحج المبرور') ||
    normTitle.includes('اثار اللعان') ||
    normTitle.includes('اثار الجهاد') ||
    normTitle.includes('الامراض الوراثيه في الحياه الزوجيه') ||
    normTitle.includes('الادمان المشروع') ||
    normTitle.includes('عقد النكاح') ||
    normTitle.includes('الجنايات بالسحر') ||
    normTitle.includes('اختاذ الوطن') ||
    normTitle.includes('اتخاذ الوطن') ||
    normTitle.includes('ابتهالات الشيخ') ||
    normTitle.includes('اراؤه الاصوليه')
  ) {
    const matched = categories.find((c) => c.id === 'cat-islamic');
    return {
      categoryId: matched?.id || 'cat-islamic',
      categoryName: matched?.name || 'العلوم الشرعية والفكر الإسلامي',
      confidence: 98
    };
  }

  if (
    normTitle.includes('خلال العصر الحديث') ||
    normTitle.includes('في الحركه الاصلاحيه') ||
    normTitle.includes('تاريخ بعض علماء عمان') ||
    normTitle.includes('الذاكره العمانيه') ||
    normTitle.includes('ابن ماجد والبرتغال') ||
    normIntro.includes('قسم التاريخ') ||
    normIntro.includes('شعبه التاريخ') ||
    normIntro.includes('كليه الاداب والعلوم الانسانيه')
  ) {
    const matched = categories.find((c) => c.id === 'cat-history');
    return {
      categoryId: matched?.id || 'cat-history',
      categoryName: matched?.name || 'التاريخ والحضارة والآثار',
      confidence: 98
    };
  }

  if (
    normTitle.includes('حسان عمان') ||
    normTitle.includes('اعلم العلماء واشعر الشعراء') ||
    normTitle.includes('ابن النضر') ||
    normTitle.includes('ديوان') ||
    normTitle.includes('قصائد')
  ) {
    const matched = categories.find((c) => c.id === 'cat-arabic');
    return {
      categoryId: matched?.id || 'cat-arabic',
      categoryName: matched?.name || 'اللغة العربية وآدابها',
      confidence: 98
    };
  }

  const rules: {
    catId: string;
    name: string;
    keywords: string[];
  }[] = [
    {
      catId: 'cat-islamic',
      name: 'العلوم الشرعية والفكر الإسلامي',
      keywords: [
        'فقه', 'عقيده', 'شريعه', 'حديث', 'تفسير', 'قران', 'اباضي', 'اباضيه', 'اصول الفقه', 'اصول الدين',
        'توحيد', 'صلاه', 'زكاه', 'صوم', 'حج', 'طهاره', 'عبادات', 'معاملات', 'احكام', 'فتاوى', 'قضاء',
        'فرائض', 'مواريث', 'اجماع', 'قياس', 'سنن', 'مسند', 'موطا', 'صحيح', 'مصطلح الحديث', 'علوم القران',
        'تجويد', 'قراءات', 'فقه مقارن', 'سلف', 'تيميه', 'اطفيش', 'اتفيش', 'جيطالي', 'سالمي', 'كندي', 'عوتبي',
        'ثميني', 'ورجلاني', 'وارجلاني', 'ربيع بن حبيب', 'ابن سلام', 'شماخي', 'جناويني', 'جناوني', 'الجامع الصغير',
        'الجامع الكبير', 'بيان الشرع', 'المصنف', 'الضياء', 'قاموس الشريعه', 'النيل', 'منهج الطالبين', 'بلاغ الراغبين',
        'الراغبين', 'الشقصي', 'الرستاقي', 'قواعد الاسلام', 'قناطر الخيرات', 'معارج الامال', 'جوهر النظام', 'تلقين الصبيان',
        'بهجه الانوار', 'مدارج الكمال', 'الاديان', 'الايضاح', 'الوضع', 'هميان الزاد', 'تيسير التفسير', 'رياض الصالحين',
        'الاربعون النوويه', 'نووي', 'استقامه', 'جهاد', 'سبيل الله', 'لعان', 'نكاح', 'زواج', 'طلاق', 'جنايات',
        'سحر', 'استيطان', 'وطن', 'ادمان', 'وراثيه', 'غيب', 'امامه', 'ابتهالات', 'دعاء', 'اذكار'
      ],
    },
    {
      catId: 'cat-arabic',
      name: 'اللغة العربية وآدابها',
      keywords: [
        'نحو', 'اعراب', 'بلاغه', 'معجم', 'معاجم', 'الفيه', 'لسان', 'سيبويه', 'جرجاني', 'شعر', 'ديوان',
        'قصائد', 'قصيده', 'اشعار', 'ابيات', 'قوافي', 'عروض', 'لغه', 'صرف', 'فصاحه', 'بيان', 'بديع',
        'معاني', 'مفردات', 'نحاه', 'ابن مالك', 'اجروميه', 'املاء', 'لسانيات', 'ادب عربي', 'ادب', 'ادبي',
        'نقد ادبي', 'نثر', 'مقامه', 'مقامات', 'روايه', 'قصه', 'حكايه', 'مسرحيه', 'نصوص ادبيه', 'حسان عمان',
        'حسان', 'رواحي', 'ابو مسلم', 'شوقي', 'حافظ', 'متنبي', 'معري', 'جاحظ', 'ابن جني', 'زمخشري', 'كشاف',
        'خليل بن احمد', 'فراهيدي', 'ابن دريد', 'جمهره', 'لسان العرب', 'تاج العروس', 'اساس البلاغه', 'قطر الندى',
        'شذور الذهب', 'الكتاب لسيبويه', 'ديوان شعر', 'قصص', 'اشعر الشعراء', 'اعلم العلماء'
      ],
    },
    {
      catId: 'cat-history',
      name: 'التاريخ والحضارة والآثار',
      keywords: [
        'تاريخ', 'حضاره', 'حضارات', 'عمان', 'اندلس', 'طبري', 'سيره', 'سيره نبويه', 'سير', 'فتوح', 'معركه',
        'غزوات', 'معارك', 'دوله', 'خلافه', 'يعاربه', 'نباهنه', 'بوسعيدي', 'اعيان', 'تراجم', 'وفيات', 'انساب',
        'سلاطين', 'ملوك', 'ائمه', 'وقائع', 'رحلات', 'ابن بطوطه', 'مسالك', 'ممالك', 'وثائق', 'جغرافيا تاريخيه',
        'قلاع', 'حصون', 'عصر', 'عهد', 'تحفه الاعيان', 'كشف الغمه', 'سير الائمه', 'انساب العرب',
        'فتوح البلدان', 'الكامل في التاريخ', 'البدايه والنهايه', 'مروج الذهب', 'مقدمه ابن خلدون', 'ابن خلدون',
        'العصر الحديث', 'الحركه الاصلاحيه', 'ابو اليقظان', 'الجزائر', 'البرتغال', 'ابن ماجد', 'الذاكره العمانيه',
        'ابن بور'
      ],
    },
    {
      catId: 'cat-science',
      name: 'العلوم الطبيعية والتكنولوجيا',
      keywords: [
        'علوم', 'فيزياء', 'كيمياء', 'احياء', 'فلك', 'طب', 'طبيعه', 'كون', 'بيئه', 'هندسه', 'تقنيه',
        'حاسوب', 'برمجه', 'ذكاء اصطناعي', 'رياضيات', 'جبر', 'حساب', 'فلكي', 'طبيه', 'صيدله', 'ادويه',
        'تشريح', 'كواكب', 'نجوم', 'شبكات', 'برمجيات', 'الكترونيات', 'طاقه', 'جيولوجيا', 'نبات', 'حيوان',
        'تجارب', 'معادلات', 'مختبر', 'ذره', 'جينات', 'معلوماتيه', 'امن سيبراني'
      ],
    },
    {
      catId: 'cat-education',
      name: 'التربية ومناهج البحث العلمي',
      keywords: [
        'تربيه', 'تربوي', 'تعليم', 'تدريس', 'مناهج التعليم', 'مناهج التدريس', 'مناهج البحث', 'بحث علمي',
        'مدرسه', 'مدارس', 'معلمين', 'معلم', 'طرق التدريس', 'علم النفس التربوي', 'ارشاد تربوي', 'تحصيل دراسي',
        'تقويم تربوي', 'بيداغوجيا', 'اطروحه', 'رساله ماجستير', 'دكتوراه', 'كفايات', 'تدريب تربوي',
        'بيئه تعليميه', 'اشراف تربوي', 'اداره مدرسيه', 'تعلم نشط', 'استراتيجيات التدريس', 'معالم الفكر التربوي'
      ],
    },
    {
      catId: 'cat-general',
      name: 'الثقافة العامة والتطوير الذاتي',
      keywords: [
        'تطوير الذات', 'تنميه بشريه', 'اداره الوقت', 'نجاح', 'قياده', 'مهارات', 'فكر', 'ثقافه عامه',
        'موسوعه', 'وعي', 'مجتمع', 'تواصل', 'علاقات', 'عادات', 'تحفيز', 'انتاجيه', 'ذكاء عاطفي', 'تفكير نقدي'
      ],
    },
  ];

  let bestCatId = categories[0]?.id || 'cat-general';
  let bestCatName = categories[0]?.name || 'عام';
  let bestScore = 0;

  for (const rule of rules) {
    let score = 0;
    for (const kw of rule.keywords) {
      const normalizedKw = normalizeArabicForSearch(kw);
      if (!normalizedKw) continue;

      if (normTitle.includes(normalizedKw)) score += 50;
      if (normAuthor.includes(normalizedKw)) score += 30;
      if (normIntro.includes(normalizedKw)) score += 20;
      if (normFilename.includes(normalizedKw)) score += 10;
    }

    if (score > bestScore) {
      bestScore = score;
      const matched = categories.find(
        (c) => c.id === rule.catId || c.name === rule.name || c.name.includes(rule.name) || rule.name.includes(c.name)
      );
      if (matched) {
        bestCatId = matched.id;
        bestCatName = matched.name;
      } else {
        bestCatName = rule.name;
        bestCatId = rule.catId;
      }
    }
  }

  const confidence = bestScore > 0 ? Math.min(100, Math.max(50, Math.round(bestScore * 1.2))) : 30;
  return { categoryId: bestCatId, categoryName: bestCatName, confidence };
}
