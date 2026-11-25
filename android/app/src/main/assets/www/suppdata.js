/* GymDay v1.10 – vitamins, minerals and supplements: the numbers behind the Supplements page.

   NUTS     the 26 nutrients the food list carries (foodmicro.js), in this order, with their units (v1.11: plant omega-3, ALA).
   needs()  a day's need for each one (ICMR-NIN 2020) and its safe upper limit, for an age, sex and activity.
   CAT      supplements sold in India, with what one tablet / capsule / softgel holds, and plain versions by dose.

   Sources (checked 16 Nov 2026):
   - Daily needs: ICMR-NIN Expert Group, "Nutrient Requirements for Indians: RDA and EAR – 2020", short report
     (summary tables: RDA by age, sex and activity; AIs for vitamins E and K, pantothenic acid, biotin, selenium,
     phosphorus, sodium, potassium, copper and manganese). https://www.nin.res.in
   - Safe upper limits: the same report's Tolerable Upper Limits (TUL); for ages and nutrients it gives none for, the
     US National Academies' Tolerable Upper Intake Levels (9–13 and 14–18 years, adults).
   - Omega-3 (EPA + DHA): 250 mg a day, the intake most food bodies recommend for adults (FAO/WHO 2010, EFSA).
   - Plant omega-3 (ALA, v1.11): ICMR-NIN gives no amount in grams, so the US National Academies' adequate intake:
     1.2 g (boys) / 1.0 g (girls) at 9–13 years, 1.6 g (men and boys 14+) / 1.1 g (women and girls 14+); no upper limit.
     https://ods.od.nih.gov/factsheets/Omega3FattyAcids-HealthProfessional/ (Table 1)
   - Products: the maker's own page or label text as listed by Indian pharmacies (1mg, PharmEasy, Truemeds,
     HealthKart, MuscleBlaze, Pfizer's label, livogen.in). Each product names its source in `src`.
     Makers change their formulas, so the app says so and lets the person change any number or read their own pack. */
(function () {
  // key, name, unit, short name, kind (v vitamin, m mineral, o other), decimals shown
  const NUTS = [
    ['va', 'Vitamin A', 'mcg', 'Vit A', 'v', 0], ['vd', 'Vitamin D', 'mcg', 'Vit D', 'v', 1], ['ve', 'Vitamin E', 'mg', 'Vit E', 'v', 1],
    ['vk', 'Vitamin K', 'mcg', 'Vit K', 'v', 0], ['vc', 'Vitamin C', 'mg', 'Vit C', 'v', 0], ['b1', 'Thiamin (B1)', 'mg', 'B1', 'v', 2],
    ['b2', 'Riboflavin (B2)', 'mg', 'B2', 'v', 2], ['b3', 'Niacin (B3)', 'mg', 'B3', 'v', 1], ['b5', 'Pantothenic acid (B5)', 'mg', 'B5', 'v', 1],
    ['b6', 'Vitamin B6', 'mg', 'B6', 'v', 2], ['b7', 'Biotin (B7)', 'mcg', 'Biotin', 'v', 0], ['b9', 'Folate (B9)', 'mcg', 'Folate', 'v', 0],
    ['b12', 'Vitamin B12', 'mcg', 'B12', 'v', 1], ['ca', 'Calcium', 'mg', 'Calcium', 'm', 0], ['fe', 'Iron', 'mg', 'Iron', 'm', 1],
    ['mg', 'Magnesium', 'mg', 'Magnesium', 'm', 0], ['zn', 'Zinc', 'mg', 'Zinc', 'm', 1], ['k', 'Potassium', 'mg', 'Potassium', 'm', 0],
    ['na', 'Sodium', 'mg', 'Sodium', 'm', 0], ['ph', 'Phosphorus', 'mg', 'Phosphorus', 'm', 0], ['se', 'Selenium', 'mcg', 'Selenium', 'm', 0],
    ['cu', 'Copper', 'mg', 'Copper', 'm', 2], ['mn', 'Manganese', 'mg', 'Manganese', 'm', 2], ['io', 'Iodine', 'mcg', 'Iodine', 'm', 0],
    ['o3', 'Omega-3 (EPA + DHA)', 'mg', 'Omega-3', 'o', 0], ['al', 'Plant omega-3 (ALA)', 'g', 'ALA', 'o', 2]];
  const KEYS = NUTS.map(n => n[0]);

  // ---------------------------------------------------------------- ICMR-NIN 2020 RDA (vitamin D: 600 IU = 15 mcg)
  //            ca    mg   fe   zn    io   b1   b2   b3  b6   b9   b12  vc  va    vd
  const RDA_COLS = ['ca', 'mg', 'fe', 'zn', 'io', 'b1', 'b2', 'b3', 'b6', 'b9', 'b12', 'vc', 'va', 'vd'];
  const RDA = {
    'm-sed': [1000, 440, 19, 17, 140, 1.4, 2.0, 14, 1.9, 300, 2.2, 80, 1000, 15],
    'm-mod': [1000, 440, 19, 17, 140, 1.8, 2.5, 18, 2.4, 300, 2.2, 80, 1000, 15],
    'm-hvy': [1000, 440, 19, 17, 140, 2.3, 3.2, 23, 3.1, 300, 2.2, 80, 1000, 15],
    'f-sed': [1000, 370, 29, 13.2, 140, 1.4, 1.9, 11, 1.9, 220, 2.2, 65, 840, 15],
    'f-mod': [1000, 370, 29, 13.2, 140, 1.7, 2.4, 14, 1.9, 220, 2.2, 65, 840, 15],
    'f-hvy': [1000, 370, 29, 13.2, 140, 2.2, 3.1, 18, 2.4, 220, 2.2, 65, 840, 15],
    'm-10': [850, 240, 16, 8.5, 100, 1.5, 2.1, 15, 2.0, 220, 2.2, 55, 770, 15],
    'f-10': [850, 250, 28, 8.5, 100, 1.4, 1.9, 14, 1.9, 225, 2.2, 50, 790, 15],
    'm-13': [1000, 345, 22, 14.3, 140, 1.9, 2.7, 19, 2.6, 285, 2.2, 70, 930, 15],
    'f-13': [1000, 340, 30, 12.8, 140, 1.6, 2.2, 16, 2.2, 245, 2.2, 65, 890, 15],
    'm-16': [1050, 440, 26, 17.6, 140, 2.2, 3.1, 22, 3.0, 340, 2.2, 85, 1000, 15],
    'f-16': [1050, 380, 32, 14.2, 140, 1.7, 2.3, 17, 2.3, 270, 2.2, 70, 860, 15],
  };
  // safe upper limits by age band; scope 'supp' = counts only what supplements give (ICMR-NIN: magnesium; the
  // National Academies: niacin, folic acid and vitamin E from supplements; preformed vitamin A, which is what tablets hold)
  const UL = {
    adult: { ca: 2500, mg: 350, fe: 45, zn: 40, io: 1100, b3: 35, b6: 100, b9: 1000, vc: 2000, va: 3000, vd: 100, ve: 1000, se: 400, cu: 10, mn: 11, ph: 4000 },
    '13': { ca: 3000, mg: 350, fe: 45, zn: 34, io: 900, b3: 30, b6: 80, b9: 800, vc: 1800, va: 2800, vd: 100, ve: 800, se: 400, cu: 8, mn: 9, ph: 4000 },
    '10': { ca: 3000, mg: 350, fe: 40, zn: 23, io: 600, b3: 20, b6: 60, b9: 600, vc: 1200, va: 1700, vd: 100, ve: 600, se: 280, cu: 5, mn: 6, ph: 4000 },
  };
  const UL_SUPP = { mg: 1, b3: 1, b9: 1, ve: 1, va: 1 };
  // where ICMR-NIN 2020 sets the limit itself (the rest: the US National Academies); for 10–18 years its table is clear
  // only for these minerals and vitamins A and D
  const UL_ICMR = { ca: 1, mg: 1, fe: 1, zn: 1, io: 1, vc: 1, va: 1, vd: 1, b3: 1, b6: 1, b9: 1 };
  const UL_ICMR_TEEN = { ca: 1, mg: 1, fe: 1, zn: 1, io: 1, va: 1, vd: 1 };
  const UL_WHY = {
    va: 'too much vitamin A from tablets can harm the liver and bones', vd: 'too much raises blood calcium', ca: 'too much can cause kidney stones and stops other minerals being absorbed',
    fe: 'more than this upsets the stomach for many people', zn: 'too much zinc blocks copper and lowers immunity', mg: 'too much magnesium from tablets causes diarrhoea',
    b6: 'months of high doses can damage nerves (tingling, numbness)', b3: 'high doses of nicotinic acid cause flushing (most tablets here use nicotinamide, which is gentler, but the limit counts both)', b9: 'high doses of folic acid can hide a lack of vitamin B12',
    vc: 'more than this often causes stomach upset or diarrhoea', io: 'too much upsets the thyroid', se: 'too much causes hair and nail loss', cu: 'too much harms the liver',
    mn: 'too much can affect the nerves', ve: 'high doses can make bleeding more likely', ph: 'too much upsets the calcium balance',
  };

  // a day's needs: { key: { need, ul, scope, ulBy, why } } for an age (years), sex ('m' / 'f' / ''), activity (1.2 / 1.4 / 1.6)
  function needs(age, sex, act) {
    const band = age > 0 && age < 13 ? '10' : age > 0 && age < 16 ? '13' : age > 0 && age < 18 ? '16' : 'adult';
    const lvl = act >= 1.55 ? 'hvy' : act >= 1.35 ? 'mod' : 'sed';
    const row = s => RDA[band === 'adult' ? `${s}-${lvl}` : `${s}-${band}`];
    const pick = sex === 'm' || sex === 'f' ? row(sex) : row('m').map((v, i) => Math.round((v + row('f')[i]) / 2 * 100) / 100);
    const o = {};
    RDA_COLS.forEach((k, i) => { o[k] = { need: pick[i] }; });
    const teen = band !== 'adult';
    const ve = sex === 'f' ? 7.5 : sex === 'm' ? 10 : 8.8;
    Object.assign(o, {
      ve: { need: ve }, vk: { need: 55 }, b5: { need: band === '10' ? 4 : 5 }, b7: { need: teen ? 35 : 40 }, se: { need: 40 },
      ph: { need: o.ca.need },                                   // ICMR-NIN keeps phosphorus equal to calcium
      o3: { need: 250 },
      al: { need: age > 0 && age < 14 ? (sex === 'f' ? 1.0 : sex === 'm' ? 1.2 : 1.1) : (sex === 'f' ? 1.1 : sex === 'm' ? 1.6 : 1.35) },
    });
    if (band === 'adult' || band === '16') Object.assign(o, { k: { need: 3500 }, cu: { need: 1.7 }, mn: { need: 4 } });
    o.na = { need: 0, max: 2000 };                               // sodium: a ceiling to stay under, not a target
    const ul = UL[band === 'adult' ? 'adult' : band === '10' ? '10' : '13'];
    for (const k in ul) { o[k] = o[k] || { need: 0 }; o[k].ul = ul[k]; o[k].scope = UL_SUPP[k] ? 'supp' : 'all'; o[k].ulBy = (teen ? UL_ICMR_TEEN : UL_ICMR)[k] ? 'ICMR-NIN 2020' : 'US National Academies'; o[k].why = UL_WHY[k] || ''; }
    o.o3.hi = 5000;                                              // EFSA: up to 5 g a day of EPA + DHA from supplements raises no safety concern
    return { band, lvl: band === 'adult' ? lvl : '', guessed: !(sex === 'm' || sex === 'f') || !(age > 0), o };
  }

  // ---------------------------------------------------------------- what a supplement holds, converted to the units above
  // per: { key: amount } for ONE tablet/capsule/softgel/sachet; IU converted: vitamin D 40 IU = 1 mcg; vitamin A (retinol) 1 IU = 0.3 mcg
  const iuD = iu => Math.round(iu / 40 * 100) / 100, iuA = iu => Math.round(iu * 0.3);
  const CATS = [['multi', 'Multivitamins'], ['omega', 'Omega-3'], ['vd', 'Vitamin D'], ['b12', 'Vitamin B12'], ['bcx', 'B-complex'], ['ca', 'Calcium'],
    ['fe', 'Iron'], ['zn', 'Zinc'], ['mg', 'Magnesium'], ['vc', 'Vitamin C'], ['ve', 'Vitamin E'], ['b7', 'Biotin'], ['b9', 'Folic acid'], ['other', 'Others']];
  const FORMS = { tablet: ['tablet', 'tablets'], capsule: ['capsule', 'capsules'], softgel: ['softgel', 'softgels'], sachet: ['sachet', 'sachets'], gummy: ['gummy', 'gummies'], ml: ['ml', 'ml'], drop: ['drop', 'drops'], scoop: ['scoop', 'scoops'], strip: ['strip', 'strips'] };
  // id, category, brand ('' = plain), name, form, default dose, default how often, per unit, where the numbers come from, extra note
  const C = (id, cat, b, n, form, d, fr, per, src, note) => ({ id, cat, b, n, form, d, fr, per, src: src || '', note: note || '' });
  const CAT = [
    // ------------------------------------------------ brands
    C('hk-multi-men', 'multi', 'HK Vitals', 'Multivitamin Plus Men', 'tablet', 1, 'day',
      { va: 1000, vc: 40, vd: iuD(400), ve: 10, vk: 55, b1: 1.2, b2: 1.3, b6: 2, b12: 2.4, b9: 200, b7: 30, b3: 16, b5: 5, zn: 17, ca: 155, mg: 100, fe: 13, mn: 2.3, cu: 0.9, io: 150, se: 55, ph: 140, na: 150 },
      '1mg.com listing of HK Vitals Multivitamin Plus Men'),
    C('supradyn', 'multi', 'Supradyn', 'Daily Multivitamin', 'tablet', 1, 'day',
      { va: iuA(5000), vd: iuD(400), vc: 75, ve: 25, b1: 5, b2: 5, b3: 50, b5: 10, b6: 1.5, b7: 150, b9: 1500, b12: 500, mg: 10, zn: 20, cu: 2, se: 70, mn: 0.005 },
      '1mg.com listing of Supradyn Daily ("each tablet contains")', 'Zinc is listed as zinc sulphate 55 mg; counted as 20 mg of zinc (the share of zinc in zinc sulphate monohydrate).'),
    C('revital-h-men', 'multi', 'Revital H', 'Men', 'capsule', 1, 'day',
      { va: iuA(1500), vd: iuD(300), ve: 7, vc: 33, b1: 1, b2: 1.4, b3: 10, b6: 0.8, b9: 80, b12: 0.8, ca: 76.9, ph: 59.43, fe: 10, zn: 10.29, mg: 3.13, mn: 0.6, cu: 0.52, io: 100, k: 2.07, na: 0.7 },
      'Truemeds.in listing of Revital H Men (Sun Pharma)', 'Also has 212.5 mg ginseng extract.'),
    C('zincovit', 'multi', 'Zincovit', 'Tablet', 'tablet', 1, 'day',
      { va: 1000, b1: 1.8, b2: 2.5, b3: 18, b5: 3, b6: 2.4, b12: 2, vc: 80, vd: 5, ve: 10, zn: 17, mg: 3, mn: 0.25, b7: 30, b9: 150, cu: 0.03, io: 140, se: 40 },
      '1mg.com and Credihealth listings of Zincovit (Apex)', 'Older packs had 22 mg zinc: check yours.'),
    C('becosules', 'bcx', 'Becosules', 'Capsule', 'capsule', 1, 'day',
      { b1: 10, b2: 10, b6: 3, b12: 15, b3: 100, b5: 50, b9: 1500, b7: 100, vc: 150 },
      "Pfizer's Becosules label (qualitative and quantitative composition)"),
    C('neurobion-forte', 'bcx', 'Neurobion Forte', 'Tablet', 'tablet', 1, 'day',
      { b1: 10, b2: 10, b3: 45, b5: 50, b6: 3, b12: 15 },
      'Neurobion Forte composition as listed by MedicineNet (from the pack)'),
    C('shelcal-500', 'ca', 'Shelcal', '500', 'tablet', 1, 'day', { ca: 500, vd: iuD(250) }, '1mg.com listing of Shelcal 500 (Torrent)'),
    C('shelcal-hd', 'ca', 'Shelcal', 'HD', 'tablet', 1, 'day', { ca: 500, vd: iuD(500) }, '1mg.com: Shelcal HD has calcium 500 mg and vitamin D3 500 IU'),
    C('uprise-d3-60k', 'vd', 'Uprise-D3', '60K', 'capsule', 1, 'week', { vd: iuD(60000) }, 'PharmEasy / Sastasundar listings (Alkem): cholecalciferol 60,000 IU',
      'A high dose usually taken once a week for a few weeks, as a doctor advises.'),
    C('livogen', 'fe', 'Livogen', 'Captab', 'tablet', 1, 'day', { fe: 50, b9: 1500 }, 'livogen.in: ferrous fumarate 152 mg = 50 mg iron, with folic acid 1.5 mg',
      'A treatment dose for anaemia, usually prescribed for a few months.'),
    C('limcee', 'vc', 'Limcee', '500 mg chewable', 'tablet', 1, 'day', { vc: 500 }, 'PharmEasy listing of Limcee (Abbott): vitamin C 500 mg'),
    C('evion-400', 've', 'Evion', '400', 'capsule', 1, 'day', { ve: 400 }, 'Evion 400 (Merck / P&G): vitamin E (tocopheryl acetate) 400 mg', 'Counted as printed: 400 mg of vitamin E as tocopheryl acetate.'),
    C('mb-fish-oil', 'omega', 'MuscleBlaze', 'Omega 3 Fish Oil 1000 mg', 'softgel', 1, 'day', { o3: 300 }, 'muscleblaze.com: 180 mg EPA and 120 mg DHA in each softgel'),
    C('mb-fish-oil-gold', 'omega', 'MuscleBlaze', 'Fish Oil Gold', 'softgel', 1, 'day', { o3: 960 }, 'HealthKart: 560 mg EPA and 400 mg DHA in each softgel'),
    C('cf-fish-oil-3x', 'omega', 'Carbamide Forte', 'Triple Strength Fish Oil 1400 mg', 'softgel', 1, 'day', { o3: 825 }, '1mg.com: 495 mg EPA and 330 mg DHA in each softgel'),
    C('cf-mg-glycinate', 'mg', 'Carbamide Forte', 'Chelated Magnesium Glycinate', 'tablet', 2, 'day', { mg: 220 }, '1mg.com: 440 mg magnesium in two tablets',
      'Two tablets give 440 mg, above the 350 mg a day that ICMR-NIN sets as the safe limit for magnesium from tablets.'),
    // ------------------------------------------------ v1.11: hand-checked labels, per ONE unit (made by tools/found2cat.py from the label log)
    C("centrum-men", "multi", "Centrum", "Men", "tablet", 1, "day", { b7: 25, ca: 250, cu: 0.45, b12: 2.2, b9: 200, io: 140, fe: 3.7, mg: 66, mn: 1.2, se: 40, b1: 1.2, va: 800, b2: 1.2, b3: 15, b5: 5, b6: 1.3, vc: 80, vd: 15, ve: 5, vk: 55, zn: 11 }, "Truemeds.in Centrum Men Tablet (composition, GSK India)"),
    C("centrum-women", "multi", "Centrum", "Women", "tablet", 1, "day", { b7: 25, ca: 325, cu: 0.45, b12: 2.2, b9: 220, io: 140, fe: 4.4, mg: 66, se: 40, va: 800, b1: 1, b2: 1, b3: 14, b5: 5, b6: 1.3, vc: 65, vd: 15, ve: 9, vk: 55, zn: 11 }, "Truemeds.in Centrum Women Tablet 30/50 (manganese amount cut off: left out)"),
    C("prorganiq-men-tab", "multi", "Prorganiq", "Men Multivitamin", "tablet", 1, "day", { va: 600, b1: 1.7, b2: 2.1, b3: 21, b5: 5, b6: 2, b12: 1, vc: 40, vd: 10, ve: 10, vk: 55, b9: 200, b7: 30, fe: 17, ca: 60, zn: 12, mg: 17, io: 150, se: 40, cu: 0.9, na: 11.5 }, "1mg.com Prorganiq Men Multivitamin Tablet, supplement facts image (1 tablet)"),
    C("cf-multi-men", "multi", "Carbamide Forte", "Multivitamin for Men (Novosules Daily)", "tablet", 1, "day", { se: 40, vc: 20, ve: 10, b7: 40, ca: 19.5, mg: 25.5, vk: 55, vd: 15, b3: 18, b5: 5, b2: 2.5, b6: 2.4, b1: 1.8, va: 1000, b9: 176.47, b12: 2.2, zn: 17, fe: 9.5, mn: 4, cu: 1.7, io: 140 }, "Carbamideforte.com product page, nutritional information image (1 tablet)"),
    C("cf-flax-1000", "omega", "Carbamide Forte", "Cold Pressed Flaxseed Oil 1000 mg", "softgel", 1, "day", { al: 0.5 }, "Carbamideforte.com supplement facts image (1 softgel)"),
    C("wn-multi-melts", "multi", "Wellbeing Nutrition", "Daily Multivitamin Melts (oral strip)", "strip", 1, "day", { vc: 70, b5: 5, b2: 2.5, b6: 2.4, b1: 1.8, va: 1000, b9: 300, io: 140, vk: 55, b7: 40, b12: 2.2, vd: 15 }, "Wellbeingnutrition.com pack back (1 strip)"),
    C("wn-multi-omega-him", "multi", "Wellbeing Nutrition", "Multi + Omega for Him (Slow)", "capsule", 2, "day", { b1: 0.9, b2: 1.25, b3: 9, b5: 2.5, b6: 1.2, b7: 20, ve: 5, fe: 1.8, cu: 0.45, io: 70, zn: 5.5, b9: 150, b12: 1.1, vc: 40, vd: 7.5, vk: 27.5, va: 500, mn: 1.15, se: 20 }, "Wellbeingnutrition.com pack back (serving 2 capsules)"),
    C("wn-multi-omega-her", "multi", "Wellbeing Nutrition", "Multi + Omega for Her (Slow)", "capsule", 2, "day", { b1: 0.85, b2: 1.2, b3: 7, b5: 2.5, b6: 0.95, io: 37.5, cu: 0.45, zn: 3.5, b9: 110, b12: 1.1, fe: 4, va: 420, vc: 32.5, ve: 5, b7: 20, se: 20, vd: 7.5, vk: 27.5, mn: 1.15 }, "Wellbeingnutrition.com pack back (serving 2 capsules)"),
    C("wn-3x-omega", "omega", "Wellbeing Nutrition", "3x Strength Omega 3 Fish Oil", "softgel", 2, "day", { o3: 539 }, "Wellbeingnutrition.com nutritional information (serving 2 softgels)"),
    C("nh-veg-omega", "omega", "Neuherbs", "Deep-Sea Veg Omega (algae oil 1000 mg)", "softgel", 1, "day", { o3: 200, vd: 15 }, "Neuherbs.com product text", "Algae oil: the label gives DHA only."),
    C("nh-flax-1000", "omega", "Neuherbs", "Flaxseed Oil 1000 mg", "softgel", 1, "day", { al: 0.5 }, "Neuherbs.com product text"),
    // v1.15: the owner's veg omega-3. Its label gives only the oil: cold-pressed flax seed (Atasi) oil 1000 mg a softgel, which is 53.4% ALA
    // (USDA SR Legacy, oil, flaxseed, cold pressed: 53.368 g in 100 g), so 0.53 g of plant omega-3. Barcode 8908018058018.
    Object.assign(C("franch-og3-veg", "omega", "Franch", "OG-3 Veg Softgel (omega-3 from flax seeds)", "softgel", 1, "day", { al: 0.53 },
      "Pack label (Amazon India product photo, Nov 2026): cold-pressed flax seed (Atasi) oil 1000 mg a softgel; ALA worked out as 53.4% of it (USDA flaxseed oil, cold pressed)",
      "The label gives the oil's weight, not its omega-3, and suggests one softgel three times a day or as your doctor says."), { alias: 'og3 og 3 og-3 franch flax atasi linseed veg omega 8908018058018' }),
    C("wn-b12-melts", "b12", "Wellbeing Nutrition", "Vitamin B12 Melts (oral strip)", "strip", 1, "day", { b12: 2.2, b9: 300 }, "Wellbeingnutrition.com pack back (1 strip)"),
    C("wn-vitc-zinc", "vc", "Wellbeing Nutrition", "Organic Vitamin C + Zinc (effervescent)", "tablet", 1, "day", { vc: 80, zn: 12 }, "Wellbeingnutrition.com nutritional facts (1 tablet 4.1 g)"),
    C("wn-vital-iron", "fe", "Wellbeing Nutrition", "Vital Iron Melts (oral strip)", "strip", 1, "day", { fe: 19, b9: 300 }, "Wellbeingnutrition.com pack back (1 strip)"),
    C("fu-vitalize", "multi", "Fast&Up", "Vitalize Multivitamins (effervescent, orange)", "tablet", 1, "day", { va: 300, b1: 1.2, b2: 1.4, b3: 11, b5: 5, b6: 1.9, b7: 30, b9: 100, b12: 0.5, vc: 37, vd: 2.5, vk: 30, ca: 100, cu: 0.01, fe: 1.5, mg: 20, mn: 1, se: 15, zn: 3, na: 248 }, "Fastandup.in nutritional information (1 tablet 4 g)", "An effervescent tablet: 248 mg of sodium in each."),
    C("fu-multi-men", "multi", "Fast&Up", "Multivitamin for Men (probiotics, omega-3)", "capsule", 2, "day", { va: 500, b1: 0.7, b2: 1, b3: 7, b5: 2.5, b6: 0.95, b7: 20, b9: 88.25, b12: 1.1, vc: 40, vd: 7.5, vk: 27.5, ca: 15, cu: 0.85, fe: 2, mg: 6, mn: 0.725, se: 20, zn: 2.67, o3: 36 }, "Fastandup.in pack back (serving 2 capsules)", "Omega-3 is the DHA in 180 mg of a 40% DHA oil (72 mg in two capsules)."),
    C("fu-multi-women", "multi", "Fast&Up", "Multivitamin for Women (probiotics, omega-3, iron)", "capsule", 2, "day", { va: 420, b1: 0.7, b2: 0.95, b3: 5.5, b5: 2.5, b6: 0.95, b7: 20, b9: 64.75, b12: 1.1, vc: 32.5, vd: 7.5, vk: 27.5, ca: 15, cu: 0.85, fe: 2, mg: 6, mn: 0.725, se: 20, zn: 2.67, o3: 36 }, "Fastandup.in pack back (serving 2 capsules)", "Omega-3 is the DHA in 180 mg of a 40% DHA oil (72 mg in two capsules)."),
    C("nh-d3-k2", "vd", "Neuherbs", "True Vitamin D3 + K2", "tablet", 1, "day", { vd: 15, vk: 55 }, "Neuherbs.com product text"),
    C("nh-multi-men", "multi", "Neuherbs", "True Vitamin Men Multivitamin", "tablet", 1, "day", { vc: 80, b3: 14, ve: 10, b5: 5, b2: 2, b6: 1.9, b1: 1.4, va: 1000, b9: 176.47, b7: 40, vk: 27.5, vd: 7.5, b12: 2.2, mg: 66, fe: 12, zn: 10, mn: 2.5, cu: 1, io: 85, se: 25, na: 7.52 }, "Neuherbs.com nutritional information (1 tablet)"),
    C("il-multi-men", "multi", "Inlife", "Multivitamin & Minerals for Men", "capsule", 2, "day", { va: 500, b1: 0.7, b2: 1, b3: 7, b5: 2.5, b6: 0.95, b7: 20, b9: 88.2, b12: 1.1, vc: 40, vd: 7.5, ve: 5, vk: 27.5, k: 45, mg: 3, mn: 0.9, cu: 0.45, se: 20, zn: 6, io: 50, fe: 3.75, ca: 25 }, "Inlifehealthcare.com supplement facts (serving 2 capsules)"),
    C("il-multi-women", "multi", "Inlife", "Multivitamin & Minerals for Women", "capsule", 2, "day", { va: 420, b1: 0.7, b2: 0.95, b3: 5.5, b5: 2.5, b6: 0.95, b7: 20, b9: 64.7, b12: 1.1, vc: 32.5, vd: 7.5, ve: 5, vk: 27.5, mg: 3, mn: 0.9, cu: 0.45, se: 20, zn: 6, io: 50, fe: 4.35, ca: 50 }, "Inlifehealthcare.com nutritional information (serving 2 capsules)"),
    C("il-d3-5000", "vd", "Inlife", "Vitamin D3 5000 IU", "softgel", 1, "day", { vd: 125 }, "Inlifehealthcare.com composition (each softgel)"),
    C("il-fish-oil", "omega", "Inlife", "Fish Oil 1000 mg (EPA 180, DHA 120 per serving)", "softgel", 2, "day", { o3: 150 }, "Inlifehealthcare.com supplement facts (serving 2 capsules)"),
    C("il-flax-500", "omega", "Inlife", "Flaxseed Oil 500 mg (omega 3-6-9)", "capsule", 1, "day", { al: 0.276 }, "Inlifehealthcare.com supplement facts (1 capsule: ALA 276 mg)"),
    C("il-iron-folic", "fe", "Inlife", "Chelated Iron Folic Acid", "tablet", 1, "day", { fe: 19, b9: 129.4, vc: 65, zn: 13.2, ve: 10, se: 40, b12: 2.2 }, "Inlifehealthcare.com \"What's inside\" (each tablet)"),
    C("il-cal-d3", "ca", "Inlife", "Calcium with Vitamin D3", "tablet", 1, "day", { ca: 500, vd: 15 }, "Inlifehealthcare.com supplement facts (1 tablet)"),
    C("il-b-complex", "bcx", "Inlife", "B-Complex", "capsule", 1, "day", { b1: 1.8, b2: 2.5, b3: 18, b5: 5, b6: 2.4, b7: 40, b12: 2.2, b9: 176.4 }, "Inlifehealthcare.com supplement facts (1 capsule)"),
    C("cf-omefish-2500", "omega", "Carbamide Forte", "Omefish Fish Oil 2500 mg", "capsule", 2, "day", { o3: 687.5, ve: 5, vc: 20, b7: 15, vd: 5, vk: 27.5 }, "Carbamideforte.com supplement facts (serving 2 capsules)"),
    C("cf-omefish-ultra", "omega", "Carbamide Forte", "5X Strength Omega 3 Fish Oil 2730 mg (Omefish Ultra, citrus lemon)", "softgel", 2, "day", { o3: 750, ve: 5, va: 420, vd: 7.5 }, "Carbamideforte.com pack back (serving 2 softgels)"),
    C("cf-biotin", "b7", "Carbamide Forte", "Biotinova Silver (sold as \"Biotin 10,000 mcg\")", "tablet", 1, "day", { b7: 40 }, "Carbamideforte.com pack back (1 tablet)", "Sold as “Biotin 10,000 mcg”: that is the weight of the plant extract. The label gives 40 mcg of biotin in a tablet."),
    C("cf-cal-mag-zinc", "ca", "Carbamide Forte", "Cimvus-Fresh Calcium Magnesium Zinc", "tablet", 2, "day", { ca: 250, mg: 27.5, zn: 6.6, b9: 64.705, vk: 27.5, vd: 7.5, b12: 1.1 }, "Carbamideforte.com pack back (serving 2 tablets)"),
    C("cf-iron", "fe", "Carbamide Forte", "Chelated Iron with Vitamin C, B12 & Zinc", "tablet", 1, "day", { fe: 29, vc: 65, b9: 129.41, b12: 2.2, zn: 13.2 }, "Carbamideforte.com pack back (1 tablet)"),
    C("fu-charge", "vc", "Fast&Up", "Charge Vitamin C + Zinc (effervescent)", "tablet", 1, "day", { vc: 50, zn: 10, na: 424 }, "Fastandup.in nutritional information (1 tablet 4 g)", "An effervescent tablet: 424 mg of sodium in each. Vitamin C is the natural vitamin C in 1000 mg of amla extract."),
    C("fu-b12", "b12", "Fast&Up", "Plant-based Vitamin B12", "tablet", 2, "day", { b12: 1, na: 6.4 }, "Fastandup.in nutritional information (serving 2 tablets)"),
    C("fu-mg-440", "mg", "Fast&Up", "Magnesium Bisglycinate (440 mg elemental)", "tablet", 1, "day", { mg: 440 }, "Fastandup.in product text (\"2000mg ... per tablet, providing 440mg of Elemental Magnesium\")", "One tablet gives 440 mg of magnesium, above the 350 mg a day that ICMR-NIN sets as the safe limit for magnesium from tablets."),
    C("prorganiq-women-tab", "multi", "Prorganiq", "Women Multivitamin", "tablet", 1, "day", { va: 600, b1: 1.7, b2: 2.1, b3: 21, b5: 5, b6: 2, b12: 1, vc: 40, vd: 10, ve: 10, vk: 55, b9: 200, b7: 30, fe: 17, ca: 60, zn: 12, mg: 17, io: 150, se: 40, cu: 0.9, na: 11.5 }, "1mg.com product pictures, supplement facts (1 tablet)"),
    C("prorganiq-women-gummy", "multi", "Prorganiq", "Women's Multivitamin Gummies", "gummy", 1, "day", { vc: 40, ve: 10, b5: 5, va: 150, b9: 50, vd: 3, b12: 2, zn: 7, io: 26 }, "1mg.com product pictures (1 gummy)"),
    C("prorganiq-men-gummy", "multi", "Prorganiq", "Men's Multivitamin Gummies", "gummy", 1, "day", { vc: 40, ve: 10, b5: 5, va: 150, b9: 50, vd: 3, b12: 2, zn: 7, io: 26 }, "1mg.com product pictures (1 gummy)"),
    C("becosules-z", "bcx", "Becosules Z", "Capsule", "capsule", 1, "day", { b1: 10, b2: 10, b6: 3, b12: 15, b3: 100, b5: 50, b9: 1500, b7: 100, vc: 150, zn: 15 }, "PharmEasy composition + RetailerShakti (\"equivalent to 15 mg elemental zinc\")", "Zinc is listed as zinc sulphate monohydrate 41.4 mg, which is 15 mg of zinc."),
    C("calcimax-forte-plus", "ca", "Calcimax", "Forte+", "tablet", 1, "day", { ca: 400, mg: 100, zn: 4, vd: 12.5 }, "RetailerShakti / Sastasundar / Truemeds (calcium carbonate 1000 mg = 400 mg calcium; vitamin D3 500 IU)", "Listings disagree on vitamin D3 (200 or 500 IU); the newer ones say 500 IU."),
    C("aii-b-complex", "bcx", "AS-IT-IS ATOM", "Vitamin B Complex", "capsule", 1, "day", { b3: 18, b5: 5, b2: 2.5, b6: 2.4, b1: 1.8, b9: 300, b7: 40, b12: 2.2, na: 0.042 }, "Asitisnutrition.com nutritional information (1 capsule)"),
    C("aii-adv-calcium", "ca", "AS-IT-IS ATOM", "Advance Calcium (calcium citrate malate)", "tablet", 2, "day", { ca: 250, mg: 100, zn: 5, vk: 27.5, vd: 7.5, na: 5.43 }, "Asitisnutrition.com nutritional information (serving 2 tablets)"),
    C("aii-iron-folic", "fe", "AS-IT-IS ATOM", "Iron & Folic Acid with Zinc", "tablet", 1, "day", { fe: 29, b9: 129.4, zn: 13.2, b12: 2.2, vc: 65 }, "Asitisnutrition.com pack and title (1 tablet)"),
    C("aii-zinc", "zn", "AS-IT-IS ATOM", "Zinc Gluconate 118 mg", "capsule", 1, "day", { zn: 17 }, "Asitisnutrition.com title (\"118mg providing 17mg elemental zinc\" per capsule)"),
    C("aii-d3-k2", "vd", "AS-IT-IS ATOM", "Vitamin D3 & K2", "capsule", 1, "day", { vd: 15, vk: 55 }, "Asitisnutrition.com title (\"600 IU Vitamin D3, 55mcg K2 MK-7 per Capsule\")"),
    C("nakpro-multi-men", "multi", "Nakpro", "Multivitamin Men (+ plant extracts)", "tablet", 1, "day", { na: 50, vc: 80, b3: 14, ve: 10, b5: 5, b2: 2, b6: 1.9, b1: 1.4, va: 800, b9: 176.47, vk: 55, b7: 40, vd: 15, b12: 2.2, ca: 250, ph: 169.6, mg: 70, k: 50, zn: 17, fe: 9.5, mn: 3, cu: 0.85, io: 70, se: 40 }, "Nakpro.com nutritional information (1 tablet)"),
    C("nakpro-multi-women", "multi", "Nakpro", "Multivitamin Women (+ plant extracts)", "tablet", 1, "day", { na: 50, vc: 65, b3: 11, ve: 10, b5: 5, b2: 1.9, b6: 1.9, b1: 1.4, va: 840, b9: 129.41, vk: 55, b7: 40, vd: 15, b12: 2.2, ca: 250, ph: 169.6, mg: 74, k: 50, fe: 18.85, zn: 13.2, mn: 3, cu: 0.85, io: 70, se: 40 }, "Nakpro.com nutritional information (1 tablet)"),
    C("bm-revive-men", "multi", "Big Muscles (M Wellness)", "Revive for Men Multivitamin", "tablet", 1, "day", { va: 840, b1: 1.4, b2: 1.9, b3: 11, b5: 5, b6: 1.9, b7: 40, b9: 129.41, b12: 2.2, vc: 65, vd: 15, ve: 10, vk: 55, zn: 13.2, ca: 100, mg: 25.2, ph: 69, fe: 19, mn: 4, cu: 1.7, k: 50, io: 140, se: 40 }, "Bigmusclesnutrition.com supplement facts (1 tablet)"),
    C("on-opti-men-in", "multi", "Optimum Nutrition", "Opti-Men (India)", "tablet", 1, "day", { va: 1000, vc: 80, vd: 15, ve: 10, vk: 55, b1: 2.3, b2: 3.2, b3: 23, b6: 3.1, b9: 176.47, b12: 2.2, b7: 40, b5: 5, ca: 52, io: 140, mg: 80, zn: 15, se: 40, cu: 1.7, mn: 2, na: 35.39 }, "Optimumnutrition.co.in nutritional information (1 tablet)", "Vitamin A here is beta-carotene (provitamin A), counted as printed."),
    C("on-opti-women-in", "multi", "Optimum Nutrition", "Opti-Women (India)", "capsule", 2, "day", { va: 420, vc: 32.5, vd: 7.5, ve: 5, vk: 27.5, b1: 1.1, b2: 1.55, b3: 9, b6: 1.2, b9: 64.705, b12: 1.1, b7: 20, b5: 2.5, ca: 95, fe: 9, io: 70, mg: 40, zn: 5.5, se: 20, cu: 0.45, mn: 2 }, "Optimumnutrition.co.in nutritional information (serving 2 capsules)", "Vitamin A here is beta-carotene (provitamin A), counted as printed."),
    C("sf-multi", "multi", "Steadfast Nutrition", "Multivitamin", "tablet", 1, "day", { va: 600, b1: 1.2, b2: 1.4, b3: 11, b5: 5, b6: 1.9, b7: 30, b9: 120, b12: 1, vc: 40, ve: 10, vd: 10, vk: 55, ca: 100, cu: 0.9, mg: 34, io: 140, fe: 8, mn: 1.2, se: 40, zn: 12 }, "Steadfastnutrition.in nutritional information (each tablet)"),
    C("sf-iron", "fe", "Steadfast Nutrition", "Iron", "tablet", 1, "day", { fe: 29, vc: 65, b3: 14, b5: 5, b2: 1.9, b6: 1.9, b1: 1.4, b9: 129.41, b7: 40, b12: 2.2 }, "Steadfastnutrition.in nutritional information (1 tablet)"),
    C("wn-b-complex", "bcx", "Wellbeing Nutrition", "Bioactive B Complex (methylated)", "capsule", 1, "day", { b1: 1.8, b2: 2.5, b3: 18, b5: 5, b6: 2.4, b9: 300, b12: 2.2, vc: 80, b7: 40 }, "Wellbeingnutrition.com supplement facts (1 capsule)"),
    C("wn-6x-omega", "omega", "Wellbeing Nutrition", "6x Strength Omega 3 Fish Oil", "softgel", 2, "day", { o3: 940 }, "Wellbeingnutrition.com nutritional information (serving 2 softgels)"),
    C("wn-d3-k2-melts", "vd", "Wellbeing Nutrition", "Vitamin D3 + K2 Melts (oral strip)", "strip", 1, "day", { vd: 10, vk: 55 }, "Wellbeingnutrition.com pack back (1 strip)"),
    C("wn-triple-mg", "mg", "Wellbeing Nutrition", "Triple Magnesium Complex", "capsule", 2, "day", { mg: 110, na: 2 }, "Wellbeingnutrition.com supplement facts (serving 2 capsules)"),
    C("nh-mini-fish", "omega", "Neuherbs", "Mini Deep-Sea Fish Oil 1000 mg (lemon)", "softgel", 1, "day", { o3: 620 }, "Neuherbs.com pack front (\"1000 mg fish oil with 380 mg EPA & 240 mg DHA\"; sold as 2x strength)", "The pack front gives 1000 mg fish oil with 380 mg EPA and 240 mg DHA."),
    C("fu-b12-bcx", "bcx", "Fast&Up", "B12 + B Complex (with folic acid and flaxseed oil)", "capsule", 1, "day", { b1: 1.4, b2: 1.9, b3: 11, b5: 5, b6: 1.9, b7: 40, b9: 129.41, b12: 2.2 }, "Fastandup.in nutritional information (1 capsule)"),
    C("cf-multi-women", "multi", "Carbamide Forte", "Multivitamin for Women (43 ingredients)", "tablet", 1, "day", { b3: 14, b5: 5, b2: 2.4, b6: 1.9, b1: 1.7, va: 840, b9: 129.41, b12: 2.2, fe: 14.5, zn: 13.2, mn: 4, cu: 1.7, io: 140, ca: 19.5, mg: 51, vk: 55, vd: 15, se: 40, vc: 20, ve: 10, b7: 40 }, "Carbamideforte.com supplement facts (1 tablet)"),
    C("il-multi-tab", "multi", "Inlife", "Multivitamin & Mineral Tablets", "tablet", 1, "day", { va: 840, b1: 1.4, b2: 1.9, b3: 11, b5: 5, b6: 1.9, b7: 40, b9: 129.4, b12: 2.2, vc: 40, vd: 15, ve: 10, vk: 55, ca: 50, mg: 20, zn: 12, fe: 10, mn: 4, cu: 1.7, io: 140, se: 40 }, "Inlifehealthcare.com nutritional information (1 tablet)"),
    C("il-cal-zinc-mg", "ca", "Inlife", "Calcium, Zinc, Magnesium", "tablet", 1, "day", { ca: 250, mg: 100, zn: 10, b9: 129.4, vk: 55, vd: 15, b12: 2.2 }, "Inlifehealthcare.com supplement facts (1 tablet)"),
    C("cf-novoplex", "bcx", "Carbamide Forte", "Novo-Plex B Complex", "tablet", 1, "day", { b3: 18, b5: 5, b2: 2.5, b6: 2.4, b1: 1.8, b9: 176.47, b7: 40, b12: 2.2 }, "Carbamideforte.com pack back (1 tablet)"),
    C("cf-zma", "mg", "Carbamide Forte", "ZMA (zinc, magnesium, B6)", "tablet", 2, "day", { mg: 220, zn: 8.5, b6: 1.2 }, "Carbamideforte.com pack back (serving 2 tablets)", "Two tablets give 440 mg of magnesium, above the 350 mg a day that ICMR-NIN sets as the safe limit for magnesium from tablets."),
    C("il-iron-29-c", "fe", "Inlife", "Chelated Iron 29 mg + Vitamin C (for women)", "tablet", 1, "day", { fe: 29, vc: 65, b9: 129.4, b12: 2.2, b6: 1.9, zn: 13.2 }, "Inlifehealthcare.com \"What's inside each tablet\""),
    C("cf-zinc-citrate-c", "zn", "Carbamide Forte", "Zinc Citrate with Vitamin C", "tablet", 1, "day", { zn: 17, vc: 40 }, "Carbamideforte.com supplement facts (1 tablet)"),
    C("cf-multi-34", "multi", "Carbamide Forte", "Multivitamin for Men & Women (34 nutrients)", "tablet", 1, "day", { b3: 18, b5: 5, b2: 2.5, b6: 2.4, b1: 1.8, va: 1000, b9: 176.47, b12: 2.2, zn: 17, fe: 9.5, mn: 4, cu: 1.7, io: 140, se: 40, vc: 20, ve: 10, b7: 40, ca: 19.5, mg: 25.5, vk: 55, vd: 15 }, "Carbamideforte.com pack back (1 tablet)"),
    C("il-b12-1500", "b12", "Inlife", "Vitamin B12 Methylcobalamin 1500 mcg", "tablet", 1, "day", { b12: 1500 }, "Inlifehealthcare.com title and text (\"Vitamin B12 Methylcobalamin 1500 mcg\", 60 tablets)"),
    C("il-mg-forte", "mg", "Inlife", "Chelated Magnesium Bisglycinate Forte 2000 mg", "tablet", 2, "day", { mg: 125 }, "Inlifehealthcare.com text (\"2,000 mg ... per two-tablet serving, delivering 250 mg of elemental magnesium\")"),
    C("bm-fish-oil", "omega", "Big Muscles", "Omega 3 Fish Oil", "softgel", 2, "day", { o3: 750 }, "Bigmusclesnutrition.com text (\"each serving ... 2500 mg of fish oil, with 900 mg of EPA and 600 mg of DHA\"; serving 2 softgels)"),
    C("sf-fish-oil", "omega", "Steadfast Nutrition", "Fish Oil", "capsule", 1, "day", { o3: 300 }, "Steadfastnutrition.in text (\"1000 mg ... with 180 mg of EPA and 120 mg of DHA\")"),
    C("cf-k2", "other", "Carbamide Forte", "Vitamin K2 MK-7 55 mcg", "tablet", 1, "day", { vk: 55 }, "Carbamideforte.com title"),
    C("cf-d3-k2-lichen", "vd", "Carbamide Forte", "Vitamin D3 K2 (veg D3 from lichen)", "tablet", 1, "day", { vk: 55, vd: 15 }, "Carbamideforte.com pack back (1 tablet)"),
    C("cf-flax-caps", "omega", "Carbamide Forte", "Flaximax Flaxseed Oil Capsules (omega 3-6-9)", "capsule", 2, "day", { al: 0.25 }, "Carbamideforte.com pack back (serving 2 capsules)"),
    C("cf-salmon-fish", "omega", "Carbamide Forte", "Omega 3 Salmon Fish Oil 1000 mg with Vitamin D & E", "softgel", 1, "day", { o3: 300, ve: 10, vd: 15 }, "Carbamideforte.com supplement facts (1 softgel)", "Vitamin E is printed as “10 mcg” at 100% RDA; counted as 10 mg."),
    C("il-algal-dha", "omega", "Inlife", "Vegetarian DHA, Omega 3 Algal Oil 400 mg", "capsule", 2, "day", { o3: 200 }, "Inlifehealthcare.com supplement facts (serving 2 capsules)"),
    C("il-d3-k2", "vd", "Inlife", "Plant-Based Vitamin D3 (Lichen) + K2 (MK7)", "tablet", 1, "day", { vd: 15, vk: 55 }, "Inlifehealthcare.com supplement facts (1 tablet)"),
    C("il-zinc-pico", "zn", "Inlife", "Zinc Picolinate & Gluconate with Copper", "capsule", 1, "day", { zn: 13.2, cu: 1 }, "Inlifehealthcare.com supplement facts (1 capsule)"),
    C("cf-bioactive-b", "bcx", "Carbamide Forte", "Bioactive B Complex (methylated)", "tablet", 1, "day", { b3: 11, b5: 5, b6: 1.9, b2: 1.9, b1: 1.4, b9: 129.41, b7: 40, b12: 2.2 }, "Carbamideforte.com supplement facts (1 tablet)"),
    C("hh-multi-men", "multi", "HealthyHey", "Multi-Vit Daily for Men", "capsule", 1, "day", { va: 500, b1: 0.9, b2: 1.25, b3: 9, b5: 2.5, b6: 1.2, b7: 20, b9: 88.2, b12: 1.1, vc: 40, vd: 7.5, ve: 5, vk: 27.5, ca: 25, cu: 0.42, io: 17.5, fe: 9.5, mg: 12.5, mn: 1, ph: 19.81, k: 50, se: 10, zn: 8.5 }, "Healthyhey.com nutritional information (1 capsule)"),
    C("hh-multi-women", "multi", "HealthyHey", "Multi-Vit Daily for Women", "capsule", 1, "day", { va: 420, b1: 0.85, b2: 1.2, b3: 7, b5: 2.5, b6: 0.95, b7: 20, b9: 64.68, b12: 1.1, vc: 32.5, vd: 7.5, ve: 5, vk: 27.5, ca: 25, cu: 0.42, io: 17.5, fe: 14.5, mg: 12.5, mn: 1, ph: 19.81, k: 50, se: 10, zn: 5 }, "Healthyhey.com nutritional information (1 capsule)"),
    C("hh-b-complex", "bcx", "HealthyHey", "Vitamin B-Complex", "capsule", 1, "day", { b1: 1.7, b2: 2.4, b3: 14, b5: 5, b6: 1.9, b7: 40, b9: 129.41, b12: 2.2 }, "Healthyhey.com nutritional information (1 capsule)"),
    C("hh-zma", "mg", "HealthyHey", "ZMA (zinc, magnesium aspartate, B6)", "tablet", 2, "day", { mg: 185, zn: 6.6, b6: 0.95 }, "Healthyhey.com nutritional information (serving 2 tablets)"),
    C("hh-fish-oil", "omega", "HealthyHey", "Omega 3 Fish Oil (600 EPA + 400 DHA)", "softgel", 2, "day", { o3: 500, ve: 0.8 }, "Healthyhey.com nutritional information (serving 2 softgels)"),
    C("hh-d3-k2", "vd", "HealthyHey", "Vitamin D3 + K2 MK-7 (lichen D3)", "capsule", 1, "day", { vd: 15, vk: 55 }, "Healthyhey.com nutritional information (1 capsule)"),
    C("hh-b12", "b12", "HealthyHey", "Vitamin B12 2.2 mcg", "capsule", 1, "day", { b12: 2.2 }, "Healthyhey.com title (\"2.2 mcg (100% RDA) per Capsule\")"),
    C("hh-mg-glycinate", "mg", "HealthyHey", "Magnesium Glycinate 14% (fully chelated)", "capsule", 2, "day", { mg: 60.5 }, "Healthyhey.com product facts (serving 2 vegetable capsules: 864 mg magnesium glycinate = 121 mg magnesium)"),
    C("pg-multi-him", "multi", "Power Gummies", "Multivitamin Him Tablet", "tablet", 1, "day", { ca: 250, vc: 80, mg: 66, zn: 11, ve: 8, fe: 3.7, b5: 3.6, b6: 1.28, mn: 1.2, va: 800, b9: 150, io: 112, b7: 40, se: 40, vd: 15, b12: 1.8 }, "Powergummies.com supplement facts (1 tablet)"),
    C("pg-multi-her", "multi", "Power Gummies", "Multivitamin Her Tablet", "tablet", 1, "day", { ca: 325, mg: 66, vc: 65, b3: 11, zn: 11, ve: 8, b5: 5, fe: 4.4, b6: 1.9, mn: 1.2, b1: 1, b2: 1, va: 800, b9: 220, io: 140, se: 40, b7: 40, vd: 15, b12: 2.2 }, "Powergummies.com supplement facts (1 tablet)"),
    C("pg-omega-369", "omega", "Power Gummies", "Omega 3, 6, 9 Softgels", "softgel", 1, "day", { o3: 750 }, "Powergummies.com supplement facts (1 softgel)"),
    C("nutrova-multi-men", "multi", "Nutrova", "Multivitamin for Men", "tablet", 1, "day", { na: 0.5, va: 300, vd: 15, ve: 10, vk: 40, vc: 80, b1: 1.4, b2: 1.5, b3: 10, b5: 5, b6: 1.9, b9: 30, b7: 40, b12: 2.2, zn: 8, cu: 1, io: 15 }, "Nutrova.com nutritional information (1 tablet)"),
    C("nutrova-multi-women", "multi", "Nutrova", "Multivitamin for Women", "tablet", 1, "day", { na: 2, va: 300, vd: 15, ve: 10, vk: 40, vc: 65, b1: 1.4, b2: 1.5, b3: 10, b5: 5, b6: 1.9, b7: 40, b9: 90, b12: 2.2, fe: 8, zn: 8, io: 30, cu: 1 }, "Nutrova.com nutritional information (1 tablet)"),
    C("nutrova-fish-84", "omega", "Nutrova", "Fish Oil 84", "softgel", 1, "day", { o3: 550 }, "Nutrova.com nutritional information (1 softgel)"),
    C("nutrova-mg-d3", "mg", "Nutrova", "Magnesium + D3", "tablet", 1, "day", { vd: 15, mg: 100, na: 6.25 }, "Nutrova.com nutritional information (1 tablet)"),
    C("nutrova-ca-mg", "ca", "Nutrova", "Calcium + Magnesium (with D3 and K2)", "tablet", 2, "day", { vd: 7.5, vk: 27.5, ca: 150, mg: 60, na: 1.25 }, "Nutrova.com nutritional information (serving 2 tablets)"),
    C("nutrova-omega-algae", "omega", "Nutrova", "Complete Omega 3 (algal DHA, vegan)", "capsule", 1, "day", { o3: 75 }, "Nutrova.com nutritional information (1 capsule)"),
    C("oziva-d3-k2-b12", "vd", "OZiva", "Vitamin D3, K2, B12 (plant based)", "tablet", 1, "day", { vd: 15, vk: 55, b12: 2.2 }, "Oziva.in product text (how to use: 1 tablet daily)"),
    C("oziva-ca-mg-zn", "ca", "OZiva", "Calcium, Magnesium, Zinc (plant based)", "capsule", 2, "day", { ca: 156.8, mg: 16.5, zn: 1.28 }, "Oziva.in product text (how to use: 2 capsules daily)"),
    C("orofer-xt", "fe", "Orofer", "XT", "tablet", 1, "day", { fe: 100, b9: 1500 }, "Sastasundar composition (\"ferrous ascorbate equivalent to elemental iron 100 mg, folic acid 1.5 mg\"); Emcure", "A treatment dose for anaemia, usually prescribed for a few months."),
    C("gemcal", "ca", "Gemcal", "Capsule", "capsule", 1, "day", { ca: 200, zn: 7.5 }, "Alkem's Gemcal product information (calcitriol 0.25 mcg, calcium carbonate 500 mg = 200 mg calcium, zinc 7.5 mg)", "Also has calcitriol 0.25 mcg, the active form of vitamin D used as a medicine; it is not counted as vitamin D here."),
    C("tayo-60k", "vd", "Tayo", "60K", "softgel", 1, "week", { vd: 1500 }, "Sastasundar composition of Tayo Soft 60K (cholecalciferol 60,000 IU); Eris", "A high dose usually taken once a week for a few weeks, as a doctor advises."),
    // ------------------------------------------------ end of the v1.11 labels
  ];
  // ------------------------------------------------ plain versions by dose
  const P = (id, cat, n, form, per, fr, note) => CAT.push(C(id, cat, '', n, form, 1, fr || 'day', per, 'Plain', note));
  [400, 1000, 2000].forEach(iu => P('d3-' + iu, 'vd', `Vitamin D3 ${iu.toLocaleString('en-IN')} IU`, iu > 1000 ? 'softgel' : 'tablet', { vd: iuD(iu) }));
  P('d3-60k', 'vd', 'Vitamin D3 60,000 IU (weekly)', 'sachet', { vd: iuD(60000) }, 'week', 'Usually once a week for a few weeks, as a doctor advises.');
  [500, 1000, 1500].forEach(u => P('b12-' + u, 'b12', `Vitamin B12 ${u} mcg (methylcobalamin)`, 'tablet', { b12: u }));
  [10, 20, 25, 50].forEach(m => P('zn-' + m, 'zn', `Zinc ${m} mg`, 'tablet', { zn: m }));
  [18, 30, 60, 100].forEach(m => P('fe-' + m, 'fe', `Iron ${m} mg`, 'tablet', { fe: m }));
  P('ca-500', 'ca', 'Calcium 500 mg', 'tablet', { ca: 500 });
  [250, 500, 1000].forEach(iu => P('cad-' + iu, 'ca', `Calcium 500 mg + vitamin D3 ${iu} IU`, 'tablet', { ca: 500, vd: iuD(iu) }));
  [100, 200, 250, 400].forEach(m => P('mg-' + m, 'mg', `Magnesium ${m} mg`, 'tablet', { mg: m }));
  [250, 500, 1000].forEach(m => P('vc-' + m, 'vc', `Vitamin C ${m} mg`, 'tablet', { vc: m }));
  [200, 400].forEach(m => P('ve-' + m, 've', `Vitamin E ${m} mg`, 'capsule', { ve: m }));
  [5000, 10000].forEach(u => P('b7-' + u, 'b7', `Biotin ${u.toLocaleString('en-IN')} mcg`, 'tablet', { b7: u }));
  [[400, '400 mcg'], [1000, '1 mg'], [5000, '5 mg']].forEach(([u, t]) => P('b9-' + u, 'b9', `Folic acid ${t}`, 'tablet', { b9: u }));
  P('fish-1x', 'omega', 'Fish oil 1000 mg (300 mg EPA + DHA)', 'softgel', { o3: 300 });
  P('fish-2x', 'omega', 'Fish oil, double strength (600 mg EPA + DHA)', 'softgel', { o3: 600 });
  P('fish-3x', 'omega', 'Fish oil, triple strength (900 mg EPA + DHA)', 'softgel', { o3: 900 });
  P('flax-1000', 'omega', 'Flaxseed oil 1000 mg (500 mg plant omega-3, ALA)', 'softgel', { al: 0.5 });
  P('algae-dha', 'omega', 'Algae omega-3, vegan (250 mg DHA)', 'capsule', { o3: 250 });
  P('bcomplex', 'bcx', 'B-complex (B1 10, B2 10, B6 3 mg, B12 15 mcg)', 'tablet', { b1: 10, b2: 10, b6: 3, b12: 15 });
  P('k2-100', 'other', 'Vitamin K2 (MK-7) 100 mcg', 'capsule', { vk: 100 });
  [100, 200].forEach(u => P('se-' + u, 'other', `Selenium ${u} mcg`, 'tablet', { se: u }));
  P('va-2500', 'other', 'Vitamin A 2,500 IU', 'tablet', { va: iuA(2500) });
  P('io-150', 'other', 'Iodine 150 mcg', 'tablet', { io: 150 });

  // label words -> key (for typing a label in, and for reading what the AI sends back)
  const WORDS = {
    va: /vitamin\s*a\b|retin(ol|yl)/i, vd: /vitamin\s*d|cholecalciferol|ergocalciferol/i, ve: /vitamin\s*e\b|tocopher/i, vk: /vitamin\s*k|phyll?oquinone|menaquinone|mk-?7/i,
    vc: /vitamin\s*c\b|ascorb/i, b1: /thiamin|vitamin\s*b-?1\b/i, b2: /riboflavin|vitamin\s*b-?2\b/i, b3: /niacin|nicotin/i, b5: /pantothen/i,
    b6: /pyridox|vitamin\s*b-?6\b/i, b7: /biotin|vitamin\s*b-?7\b|vitamin\s*h\b/i, b9: /fol(ic|ate)|vitamin\s*b-?9\b/i, b12: /cobalamin|vitamin\s*b-?12/i,
    ca: /calcium/i, fe: /\biron\b|ferr(ous|ic)/i, mg: /magnesium/i, zn: /\bzinc\b/i, k: /potassium/i, na: /sodium/i, ph: /phosph/i, se: /selen/i,
    cu: /copper|cupr/i, mn: /mangan/i, io: /iodi/i, o3: /omega|epa\b|dha\b|eicosapent|docosahex|fish oil|algae|algal/i,
    al: /\bala\b|alpha[- ]?linolen|flax|linseed|\bchia\b|plant omega|veg(an|etarian)? omega/i,
  };
  window.SUPPDATA = { NUTS, KEYS, needs, CATS, FORMS, CAT, WORDS, UL_WHY };
})();
