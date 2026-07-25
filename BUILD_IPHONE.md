# בניית BizFlow לאייפון

הפרויקט מוכן לבנייה. ה-export ל-iOS עובר (593 מודולים), `eas.json` מוגדר,
ומזהי החבילה והפרויקט כבר במקום ב-`app.json`.

## מה נדרש ממך

חשבון **Apple Developer** בתשלום (99$ לשנה, developer.apple.com).
אפל דורשת חתימה על כל אפליקציה שמותקנת על אייפון — אין דרך לעקוף את זה.

בנוסף: חשבון Expo עם הרשאה לפרויקט של `lera2004`.

## הרצף

```bash
cd bizflow-expo
pnpm install

pnpm exec eas-cli login          # חשבון ה-Expo שלך
pnpm exec eas-cli build --profile preview --platform ios
```

בבנייה הראשונה EAS ישאל על החתימה. בחרי בניהול אוטומטי — הוא ייצר את
התעודה ואת הפרופיל מול חשבון ה-Apple Developer שלך, וירשום את המכשיר.

הבנייה רצה בשרתים של Expo ולוקחת בערך 10–20 דקות. בסיום מתקבל קישור
התקנה. פתיחה שלו מהאייפון מתקינה את האפליקציה.

`preview` מוגדר כ-`distribution: internal`, כלומר התקנה ישירה על מכשירים
רשומים — בלי App Store ובלי תהליך אישור.

## עדכונים אחרי ההתקנה

שינוי ב-`assets/bizflow/BizFlow.html` לא מצריך בנייה מחדש:

```bash
pnpm run publish:preview
```

זה דוחף עדכון ל-ערוץ `preview`, והאפליקציה המותקנת מושכת אותו בפתיחה הבאה.
בנייה מחדש נדרשת רק כששינו תלויות או הגדרות מקוריות.

## לפני מסירה

```bash
pnpm exec expo export --platform ios
```

הבנייה האחרונה שנבדקה:

```text
iOS Bundled
593 modules
BizFlow.html, support.txt and vendor/* packaged successfully
```
