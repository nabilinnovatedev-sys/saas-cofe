# شرح المشروع: كيفاش خدام وعلاش منظم بهاد الطريقة

هاد المشروع هو plateforme multi-cafés فيها 3 واجهات منفصلين، ولكن كيتشاركو نفس قاعدة البيانات ونفس القواعد métier:

1. **Administration web**: غير للـ administrateur الرئيسي باش يسير cafés، menus، tables، QR codes، serveurs وcommandes.
2. **Site public**: الزبون كيشوف menu وكيطلب بلا compte وبلا login.
3. **Application mobile serveur**: serveur كيدخل بالإيميل وmot de passe وكيشوف غير commandes ديال café ديالو.

الـ backend كامل مبني فوق Supabase: PostgreSQL، Auth، Storage، Realtime وEdge Functions.

---

## 1. الصورة العامة ديال architecture

```text
Administrateur ──> Application Web ─────┐
                                       │
Client بلا compte ─> Menu Public ──────┼──> Supabase
                                       │    ├── PostgreSQL + RLS
Serveur ─────────> Application Expo ───┘    ├── Auth
                                            ├── Storage
                                            ├── Realtime
                                            └── Edge Functions
                                                   │
                                                   └── Expo Push / APNs / FCM
```

الهدف من هاد التقسيم هو أن كل interface تكون عندها المسؤولية ديالها:

- الزبون ماكيحتاجش compte.
- serveur ماعندوش accès للـ menu ولا branding ولا comptes.
- administrateur هو الوحيد اللي يقدر يسير المنصة كاملة.
- قواعد الأمن ماشي غير فالواجهة؛ مطبقة حتى فـ PostgreSQL وRLS.

---

## 2. علاش استعملنا Monorepo؟

المشروع كامل مجموع فـ repository واحد، وهادشي كيتسمى **monorepo**.

```text
app-coffe/
├── apps/
│   ├── web/
│   └── waiter-mobile/
├── packages/
│   └── domain/
├── supabase/
├── scripts/
├── README.md
├── ARCHITECTURE.md
└── package.json
```

استعملنا monorepo باش:

- web وmobile يتشاركو نفس types والقواعد métier.
- مانعاودوش نفس code ديال statuts، prix وvalidation فجوج تطبيقات.
- installation وtests وbuild يتدارو من root بأوامر موحدة.
- أي تغيير فـ cycle ديال commande يبقى مطابق فـ web، mobile وdatabase.

---

## 3. شرح dossiers الرئيسية

### `apps/`

هنا كاينين التطبيقات اللي كيستعملهم الناس مباشرة.

#### `apps/web/`

هاد dossier فيه application React/Vite ديال:

- administration privée؛
- menu public ديال كل café؛
- panier وconfirmation؛
- suivi ديال commande.

علاش جمعنا admin وpublic فنفس application؟

- بجوجهم applications web.
- React Router كيفصل routes ديالهم.
- deployment واحد كافي.
- public template كيبقى واحد، وكل café كيتبدل غير بالـ slug، logo، couleurs وmenu.

أهم الملفات:

```text
apps/web/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── styles.css
│   ├── lib/
│   │   └── supabase.ts
│   └── pages/
│       ├── Login.tsx
│       ├── Admin.tsx
│       └── PublicCafe.tsx
├── public/_redirects
├── vercel.json
├── vite.config.ts
└── package.json
```

##### `src/main.tsx`

هو point d’entrée ديال React. كيربط application مع `<div id="root">` اللي فـ `index.html`، وكيفعل React Router.

##### `src/App.tsx`

فيه routes الرئيسية:

```text
/connexion                  Login administrateur
/admin                      Dashboard عام
/admin/cafes/:id/...        Gestion ديال café
/:slug                      Menu public
/suivi/:token               Suivi sécurisé ديال commande
```

كيحمي routes ديال admin وكيأكد أن session عندها rôle `platform_admin` وcompte actif.

##### `src/pages/Admin.tsx`

فيه الشاشات الإدارية:

- création وتعديل café؛
- identité visuelle؛
- catégories ومنتجات؛
- upload ديال الصور؛
- tables وQR codes؛
- comptes serveurs؛
- commandes؛
- publication.

العمليات الإدارية العادية كتدوز عبر Supabase مع RLS. العمليات الحساسة بحال إنشاء compte serveur كتدوز عبر Edge Function آمنة.

##### `src/pages/PublicCafe.tsx`

فيه parcours ديال client:

```text
QR table
  ↓
Menu publié
  ↓
Ajout au panier
  ↓
Validation table/prix/disponibilité
  ↓
Création commande
  ↓
Lien secret de suivi
```

الـ panier كيتحفظ فـ `localStorage`. إلا تقطع réseau، الزبون ماكيفقدش الطلب. نفس clé d’idempotence كتستعمل فالـ retry باش ماتخلقش جوج commandes.

##### `src/lib/supabase.ts`

كيخلق Supabase client باستعمال غير:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

ماكايناش `service_role` فالfrontend، حيث هادي clé خطيرة كتقدر تتجاوز RLS.

##### `styles.css`

فيه design system كامل:

- couleurs؛
- typographie؛
- responsive؛
- focus states؛
- admin layout؛
- menu mobile؛
- panier؛
- suivi commande.

##### `_redirects` و`vercel.json`

هاد الملفات كيضمنو SPA fallback. مثلا إلا دخل user مباشرة لـ `/cafe-atlas`، hébergeur كيرجع `index.html` وReact Router كيعرض الصفحة الصحيحة.

---

#### `apps/waiter-mobile/`

هاد application مختلفة على site public. مبنية بـ React Native وExpo وكتخدم على Android وiOS.

```text
apps/waiter-mobile/
├── App.tsx
├── index.js
├── lib/supabase.ts
├── app.json
├── app.config.js
├── eas.json
├── .env.example
└── package.json
```

##### `App.tsx`

فيه:

- login serveur؛
- invitation وpassword reset؛
- commandes actives؛
- détails وhistorique؛
- transitions ديال statut؛
- mode offline؛
- Realtime؛
- notification permissions؛
- ouverture ديال commande من push notification.

الـ serveur ماكيختارش café. `cafe_id` كيتجاب من profile ديالو فـ database، باش مايقدرش يبدلو من application.

##### `app.json` و`app.config.js`

فيهم configuration ديال Expo:

- اسم application؛
- bundle identifiers Android/iOS؛
- URL scheme `cafe-waiter://`؛
- notification permissions؛
- EAS project ID.

URL scheme مهم باش liens ديال invitation وpassword reset يحلو application مباشرة.

##### `eas.json`

فيه profils ديال builds:

- `development`: للتجارب على device؛
- `preview`: build داخلي؛
- `production`: build ديال stores.

##### `lib/supabase.ts`

Supabase client ديال mobile. Session كتتحفظ فـ `AsyncStorage` باش serveur يبقى connecté من بعد مايسد application.

---

### `packages/domain/`

هاد package فيه business logic المشترك بين web وmobile.

```text
packages/domain/
└── src/
    ├── index.ts
    └── index.test.ts
```

فيه:

- statuts الستة ديال commande؛
- transitions المسموح بها؛
- labels بالفرنسية؛
- formatage ديال prix؛
- calcul ديال panier؛
- normalisation ديال slug؛
- correction ديال couleurs باش يبقى contraste accessible؛
- types ديال menu وproduits.

مثلا cycle ديال commande هو:

```text
nouvelle
   ↓
acceptee
   ↓
en_preparation
   ↓
prete
   ↓
servie

أي statut non terminal ──> annulee، ولكن motif obligatoire
```

علاش هاد logic فـ package بوحدو؟

باش web وmobile مايكونوش عندهم تعريف مختلف لنفس statut أو transition.

---

### `supabase/`

هاد dossier هو backend versionné ديال المشروع.

```text
supabase/
├── config.toml
├── migrations/
├── functions/
├── tests/
├── seed.sql
└── .env.example
```

#### `supabase/migrations/`

فيه SQL migrations بالترتيب:

```text
202610220001_core.sql
202610220002_functions.sql
202610220003_audit.sql
202610220004_outbox_claim.sql
202610220005_push_receipts.sql
```

##### `001_core.sql`

كيخلق:

- tables؛
- relations؛
- indexes؛
- contraintes؛
- enums؛
- RLS policies؛
- Storage buckets؛
- Realtime publication.

كل donnée مرتبطة بـ café عندها `cafe_id`. وزدنا foreign keys composées باش مستحيل مثلا نربط produit ديال Café A مع catégorie ديال Café B.

##### `002_functions.sql`

فيه fonctions métier الحساسة:

- إنشاء وrotation ديال QR؛
- publication atomique؛
- قراءة menu public؛
- إنشاء commande؛
- suivi secret؛
- transition ديال statut.

حساب prix كيتدار هنا، ماشي فالfrontend. حتى إلا client صيفط prix مزور، database كتستعمل prix الحقيقي ديال produit.

##### `003_audit.sql`

كيكتب historique ديال suspension وتغيير statut ديال café.

##### `004_outbox_claim.sql`

كيخلي push worker ياخذ événements بطريقة atomique باستعمال locking، باش جوج workers مايصيفطوش نفس notification.

##### `005_push_receipts.sql`

كيحفظ Expo push tickets ونتائج delivery. إلا Expo رجع `DeviceNotRegistered`، token كيتعطل.

#### `supabase/functions/`

هاد Edge Functions كيتنفذو فالـ server، وعندهم accès للـ secrets اللي ممنوع يكونو فالfrontend.

```text
supabase/functions/
├── _shared/
├── create-order/
├── track-order/
├── admin-staff/
├── bootstrap-admin/
├── register-device/
├── push-worker/
└── push-receipts/
```

##### `create-order`

كيستقبل panier anonymous، كيحسب IP hash، كيولد tracking token، ومن بعد كينادي transaction SQL.

##### `track-order`

كيحوّل tracking token لـ hash وكيجيب غير commande المطابقة. `public_ref` بوحدو ماكافيش باش تقرا commande.

##### `admin-staff`

كيأكد أن caller هو admin actif، ومن بعد يقدر:

- يدعي serveur؛
- يعطلو؛
- يعاود يفعّلو؛
- يصيفط password reset.

##### `bootstrap-admin`

كتستعمل مرة وحدة باش تخلق أول admin. كتطلب secret مؤقت، وكترفض الخدمة إلا كان admin موجود من قبل.

##### `register-device`

كيحفظ Expo Push Token ديال serveur مشفر بـ AES-GCM. فالـ database كاين كذلك hash باش مانكرروش نفس token.

##### `push-worker`

كيقرا notification outbox وكيصيفط notifications عبر Expo Push.

##### `push-receipts`

كيشوف واش push وصل أو فشل، وكيعطل tokens اللي مابقاوش صالحين.

#### `supabase/tests/`

فيه tests SQL ديال:

- existence ديال schema وpolicies؛
- isolation بين Café A وCafé B؛
- recalcul ديال prix؛
- idempotence؛
- tracking token؛
- transitions؛
- conflits ديال version.

#### `supabase/seed.sql`

Demo data اختيارية ومعلّقة بالتعليقات. ماكتدخلش production data بوحدها.

---

### `scripts/`

```text
scripts/
├── bootstrap-admin.sh
└── check-env.mjs
```

#### `bootstrap-admin.sh`

Script صغير كينادي Edge Function ديال أول admin بلا مايطبع password ولا secrets فالـ logs.

#### `check-env.mjs`

كيفحص واش variables publiques الضرورية موجودة قبل launch.

---

## 4. كيفاش كيدوز workflow ديال administrateur؟

```text
Login Supabase Auth
  ↓
RLS كتأكد role = platform_admin وactive = true
  ↓
Création café en brouillon
  ↓
Identité + couleurs + logo + contacts
  ↓
Catégories + produits + photos
  ↓
Tables + QR opaques
  ↓
Invitation serveurs
  ↓
Publication atomique
```

التغييرات ديال menu كتبقى brouillon حتى admin يدير publication، ماعدا disponibilité ديال produit كتتطبق مباشرة باش نوقفو البيع بسرعة.

---

## 5. كيفاش كيدوز workflow ديال client؟

### قراءة menu

الزبون كيسكاني QR بحال:

```text
https://menu.example.ma/cafe-atlas?table=TOKEN_OPAQUE
```

`public_get_menu` كتأكد:

- café actif؛
- عندو publication؛
- table token صحيح وactive؛
- غير snapshot المنشور هو اللي يبان.

إلا فتح `/cafe-atlas` بلا QR، يقدر يشوف menu ولكن ما يقدرش يصيفط commande.

### إرسال commande

Frontend كيصيفط:

- product IDs؛
- quantities؛
- notes؛
- prix اللي شاف client؛
- table token؛
- idempotency UUID.

Server كيدير من جديد:

1. validation ديال café وtable؛
2. rate limit؛
3. validation ديال quantities وnotes؛
4. lecture ديال produits الحقيقيين؛
5. comparaison ديال prix؛
6. calcul total؛
7. création order/items/history/outbox فنفس transaction.

إلا تبدل prix، commande ماكتتخلقش. Client كيشوف ancien prix والجديد وكيأكد مرة أخرى.

---

## 6. كيفاش كيدوز workflow ديال serveur؟

```text
Login email/password
  ↓
Lecture profile serveur
  ↓
cafe_id كيتحدد من database
  ↓
Chargement commandes actives تحت RLS
  ↓
Subscription Realtime
  ↓
Transition مع expected_version
```

كل transition كتطلب `version` اللي قراها serveur. مثلا جوج serveurs شافو version 1 وحاولو يقبلو نفس commande:

- الأول كيربح وكيكتب version 2؛
- الثاني كيلقى version تبدلات؛
- كيتوصل بـ `CONFLICT` وكيعاود يحمّل état الصحيح.

هادشي كيمنع double action وhistorique غلط.

---

## 7. Realtime وPush: شنو الفرق؟

### Realtime

كيخدم ملي application مفتوحة وconnectée. Supabase كيعلمها أن commande تبدلات، ومن بعد application كتعيد قراءة donnée الصحيحة تحت RLS.

### Push notification

كتخدم ملي application فالخلفية أو مسدودة:

```text
Commande created
  ↓
notification_outbox
  ↓
push-worker
  ↓
Expo Push
  ↓
APNs / FCM
  ↓
Téléphone serveur
```

من بعد `push-receipts` كيتأكد من delivery ويعالج tokens غير الصالحين.

Realtime ماشي بديل للـ push؛ بجوج مطلوبين.

---

## 8. كيفاش خدام security؟

الأمن فيه عدة طبقات:

### فالواجهة

- admin routes محميين؛
- serveur ماكيشوفش menu management؛
- actions offline كيتعطلو؛
- inputs عندهم validation.

### فـ Edge Functions

- session كتتفحص؛
- rôle وactive status كيتفحصو؛
- secrets كيبقاو server-side؛
- IP كيتخزن hash ماشي raw؛
- tracking token وdevice token محميين.

### فـ PostgreSQL/RLS

- serveur كيقرا غير `cafe_id` ديالو؛
- public ماعندوش accès مباشر للـ orders؛
- admin role مايمكنش user يعطيه لراسو؛
- كل relation multi-café محمية بقيود؛
- transitions والأسعار مفروضة من database.

إخفاء button فالواجهة بوحدو ماشي security. حتى request مباشرة لـ Supabase خاصها تدوز من نفس RLS والقواعد.

---

## 9. Environment variables

### Variables مسموح بها فالfrontend

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_EAS_PROJECT_ID=
```

هاد القيم public بطبيعتها، والحماية الحقيقية كيديروها RLS وserver functions.

### Secrets server-only

```env
SUPABASE_SERVICE_ROLE_KEY=
TRACKING_SECRET=
ABUSE_HASH_SECRET=
BOOTSTRAP_SECRET=
DEVICE_ENCRYPTION_KEY=
PUSH_WORKER_SECRET=
```

ممنوع هاد secrets يدخلو فـ `VITE_*` أو `EXPO_PUBLIC_*`.

---

## 10. أهم الأوامر

### Installation

```bash
npm install
```

### Web

```bash
npm run dev:web
```

### Mobile

```bash
npm run dev:mobile
```

### Vérification كاملة

```bash
npm run check
npx expo-doctor apps/waiter-mobile
supabase test db
```

### Supabase local

```bash
supabase start
supabase db reset
supabase functions serve --env-file supabase/.env.local
```

### Production build

```bash
npm run build
```

التفاصيل ديال installation، hosted Supabase، bootstrap admin وEAS موجودة فـ [README.md](./README.md).

---

## 11. علاش بعض الملفات ماخاصناش نبدلوهم عشوائيا؟

- `package-lock.json`: كيضمن نفس versions ديال dependencies عند الجميع.
- `supabase/migrations/*`: التاريخ الرسمي ديال database؛ خاص أي تعديل جديد يكون migration جديدة.
- `packages/domain/src/index.ts`: أي تغيير هنا كيأثر على web وmobile.
- `.env`: فيه configuration محلية وماخاصوش يدخل Git.
- `.env.example`: غير template بلا secrets، وخصو يبقى محدث.

---

## 12. منين نبدأ إلا بغيت نطور feature جديدة؟

1. حدد واش feature تخص admin، client، serveur أو backend.
2. إلا فيها règle métier مشتركة، زيدها فـ `packages/domain`.
3. إلا فيها données جديدة، خلق migration جديدة وما تبدلش production يدويا.
4. طبق RLS قبل ما تربط الواجهة.
5. استعمل Edge Function إلا العملية anonymous أو محتاجة service role.
6. زيد tests ديال permissions والحالات الخاصة.
7. شغل `npm run check` و`supabase test db` قبل deployment.

بهذا التنظيم، الواجهة تقدر تتبدل، ولكن sécurité وbusiness rules كيبقاو ثابتين ومفروضين من backend.
