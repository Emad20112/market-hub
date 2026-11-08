import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".output",
      ".vinxi",
      "node_modules",
      "scripts",
      "public",
      "screenshots",
      "docs",
      "supabase",
      "backups",
      "backup-before-repair",
      ".aistudio",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
          patterns: [
            {
              /* أرقام دعم الشركة بيانات خاصة تظهر في المستندات المطبوعة فقط.
               * أي شاشة تريدها تستخدم `@/lib/printing/company-credit` ولا تعرضها. */
              group: ["@/lib/company-credit", "**/company-credit"],
              message:
                "أرقام دعم المنشأة تظهر في المستندات المطبوعة فقط. الاستيراد من `@/lib/printing/company-credit` أو `@/lib/printing/identity`، ولا تُعرض الأرقام على أي شاشة.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      /*
       * حقول الأرقام: المتصفح يغيّر قيمة `type="number"` عند تمرير عجلة الماوس
       * فوقه، ويرفض الأرقام العربية والفاصلة. لذلك المال → AmountInput والكمية
       * → QuantityInput، وكلاهما يُعرض `type="text"` + `inputMode="decimal"`.
       */
      "no-restricted-syntax": [
        "error",
        {
          selector: 'JSXAttribute[name.name="type"][value.value="number"]',
          message:
            'لا تستخدم type="number": استعمل <AmountInput> للمبالغ أو <QuantityInput> للكميات — عجلة الماوس تغيّر رقم type="number" بلا إذن.',
        },
      ],
    },
  },
  {
    /*
     * حظر استدعاء RPC مباشر خارج طبقة النطاقات (docs/ARCHITECTURE_REVIEW.md §3.2).
     * يبدأ بوضع "warn" في المرحلة 1، ويُشدَّد إلى "error" مجالًا بعد مجال
     * مع اكتمال تغليف دوال كل مجال في src/domains/.
     */
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/domains/**"],
    rules: {
      "no-restricted-properties": [
        "warn",
        {
          object: "supabase",
          property: "rpc",
          message:
            "استدعاء RPC مباشر غير مسموح خارج src/domains. استخدم خدمة المجال (src/domains/<domain>/services) — راجع docs/ARCHITECTURE_REVIEW.md §3.2.",
        },
      ],
    },
  },
  eslintPluginPrettier,
  {
    /* استثناء: طبقات الطباعة والقوالب هي المكان الشرعي الوحيد لأرقام الدعم. */
    files: ["src/lib/printing/**", "src/lib/templates/**"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
);
