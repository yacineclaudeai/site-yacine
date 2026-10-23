# لوحة العمل · المرحلة 1

منصة تسيير الفروع والستوك والحسابات (تعوض شيتات الإكسال، ومن بعد أوكتوماتيك).
الخطة والقواعد: `CLAUDE.md` و`docs/prototype.html`.

## واش كاين في المرحلة 1
- دخول بالإيميل وكلمة السر. المدير يخلق الحسابات (الاسم، الإيميل، الهاتف، تاريخ الدخول، الدور، كلمة السر)، يبدل كلمة السر، ويبلوكي.
- الفروع بالنوع تاعها (50/50، شهرية، أدس فقط) وشركة التوصيل (اسم برك).
- المنتجات: كل منتج لفرع واحد، ألوان ومقاسات، ستوك، تنبيه كي ينقص.
- الفرع: "وصلتك سلعة؟" باسم المنتج، العد اليومي، الرتور بالاختيار (1 لـ70)، حسابي والسيولة.
- المدير: دفتر حساب كل فرع (رفد، شرا، بعث، أدس)، الإلغاء بحركة معاكسة.
- كل تبديل في الستوك والدراهم والحسابات يتسجل في `audit_log`.

## التقنية
Next.js 15 + TypeScript، Supabase (Postgres + Auth + RLS)، Netlify.
- `supabase/migrations/` الجداول والصلاحيات والدوال.
- `supabase/seed.sql` بيانات تجريبية (بلا زبائن حقيقيين).
- `lib/accounting.ts` معادلات الحساب.

## التيستات
```
npm test                 # معادلات الحساب
npm run test:db          # الصلاحيات (RLS) على Postgres محلي
```

## التشغيل محليا
```
npx supabase start       # يحتاج Docker
cp .env.example .env.local   # وحط المفاتيح اللي يعطيهم supabase start
node scripts/create-manager.mjs "ياسين" email@example.com
npm run dev
```

## الإطلاق
1. مشروع جديد في Supabase، ومن بعد `npx supabase link` و`npx supabase db push` (بلا seed).
2. موقع في Netlify مربوط بالـrepo (Import from GitHub)، وتحط فيه `NEXT_PUBLIC_SUPABASE_URL`، `NEXT_PUBLIC_SUPABASE_ANON_KEY`، `SUPABASE_SERVICE_ROLE_KEY`.
3. `node scripts/create-manager.mjs` مرة وحدة باش تخلق حساب المدير.
