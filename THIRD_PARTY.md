# Third-party content in GymDay

GymDay's own code is under the MIT Licence (see [LICENSE](LICENSE)). The data, pictures and icons below come from other people. They are **not** under the MIT Licence: each keeps its own licence or terms, as listed here. The same credits are shown in the app under **Settings → About GymDay**.

## Exercise photos and steps

- **free-exercise-db**: exercise photos (resized to 480 px) and their steps. Public domain. https://github.com/yuhonas/free-exercise-db
  Files: `android/app/src/main/assets/www/img/`, `android/app/src/main/assets/www/exercises.js`

## Food data

The food tables are `android/app/src/main/assets/www/foods.js` and `foodmicro.js`. Each food in them names its source.

| Source | Licence or terms |
|---|---|
| US Department of Agriculture, FoodData Central (FNDDS 2021–2023 and SR Legacy) | Public domain |
| Indian Nutrient Databank (INDB) by Anuvaad Solutions (Vijayakumar A. et al., *Current Developments in Nutrition*, 2024) | Open access. Credited |
| Indian Food Composition Tables 2017 (Longvah T., Ananthan R., Bhaskarachary K. and Venkaiah K., National Institute of Nutrition, ICMR, Hyderabad) | © 2017 National Institute of Nutrition, ICMR. Cited the way the book asks |
| McCance and Widdowson's Composition of Foods Integrated Dataset 2021 (UK) | Contains public sector information licensed under the Open Government Licence v3.0 |
| AUSNUT 2023, Food Standards Australia New Zealand | CC BY 4.0 |
| FAO/INFOODS Food Composition Table for Western Africa 2019 | CC BY-NC-SA 3.0 IGO (non-commercial, share alike) |
| FAO, *Sorghum and millets in human nutrition* (1995): finger millet (ragi) | © FAO. Credited |
| Open Food Facts: about 8,900 Indian packets | © Open Food Facts contributors. Database under the Open Database Licence (ODbL) 1.0. Product data in GymDay that came from Open Food Facts is shared under the ODbL 1.0 too |
| Restaurant chains: McDonald's India (North & East) and Pizza Hut nutrition booklets; KFC, Burger King, Subway, Starbucks, La Pino'z, Wow! Momo and Third Wave Coffee as listed on Swiggy (Nov 2026); a few Domino's items from FatSecret India | Facts as published by each chain. The names and trademarks belong to their owners. GymDay is not linked to any of them |
| Brand labels (protein powders, drinks, packets) | Numbers from each maker's own label, website or pharmacy listing (Nov 2026). The names and trademarks belong to their owners |

The food versions (rice by variety, rotis by flour and so on) are worked out by GymDay from these tables, and each has a note saying how.

## Nutrient targets

- ICMR-NIN, *Nutrient Requirements for Indians: RDA and EAR – 2020* (summary tables and Tolerable Upper Limits). https://www.nin.res.in
- US National Academies' intakes, as summed up by the NIH Office of Dietary Supplements, where ICMR-NIN gives no amount (for example plant omega-3). https://ods.od.nih.gov

## Icons

- **Lucide** (https://lucide.dev): the icons on the Settings pages. ISC License, Copyright (c) 2026 Lucide Icons and Contributors. The licence text is at the top of `android/app/src/main/assets/www/setkit.js`.

## Videos

- Form videos open on YouTube. GymDay only links to them; they belong to their creators.

## Services the server uses

- **Supabase** runs the optional server (accounts, clubs).
- **Anthropic's Claude API** reads meal photos, labels and screenshots. It is called only from the server, with the server owner's own key.
