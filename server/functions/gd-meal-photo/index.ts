// GymDay: reads a photo of a meal and answers with the foods it can see and an estimate of their calories and macros,
// or (v1.8) a photo of a supplement or food packet's label: brand, serving size and what one serving holds.
// A Supabase Edge Function. The app sends { image: "<base64 JPEG>" } or { image, kind: "label" } with the person's sign-in.
// v1.8.1: with { ask: 3 } the AI may answer with up to 3 questions when the photo leaves something open (plus its best guess,
// for people who skip them); the app then sends the same photo again with { answers: [{ q, a }] } and gets the final read,
// which never asks again. Apps that send neither get exactly what they got before.
//
// It needs ONE secret with an AI key (Edge Functions -> Secrets). Whichever is there is used:
//   GEMINI_API_KEY      Google Gemini   (has a free allowance)
//   ANTHROPIC_API_KEY   Claude          (paid)
//   OPENAI_API_KEY      ChatGPT's maker (paid)
// Optional secrets: GD_AI_PROVIDER = gemini | claude | openai (when more than one key is there),
//                   GD_AI_MODEL    = a model name, when the built-in one has been retired.
// Each read is counted against the person (40 a day) by the database function gd_ai_use().
// The photo and the key are never written to the log, and the photo is not kept anywhere by this function.
// v1.9: Gemini is asked to think only a little (by default its newest Flash model thought for 45 s or more on a photo), and when
// it is slow, busy or failing the read is tried once more with Google's quicker Flash-Lite model, all within the app's 60 s.
// Each Gemini call writes one line to the function's log: the model, how long it took and, when it failed, Google's reason.
// Snacks: for apps that let the AI ask, it may ask whether a snack is homemade or packaged, the oil, and how much was eaten.
// v1.10: { image, kind: "supp" } reads a vitamin, mineral or fish-oil label: each vitamin and mineral in ONE tablet, capsule,
// softgel, sachet, gummy, ml or drop, by key, with its amount and unit as printed (the app turns IU into mcg).
// v1.12: apps that send { grams: 1 } with a meal photo also get each item's weight in grams. And { kind: "web", q, where }
// (no photo) looks a restaurant, cafe or shop dish up on the web: Gemini with Google Search (gemini-2.5-flash, free up to
// 500 searches a day; GD_WEB_MODEL to change it) or Claude's web search, answering with the numbers and the pages they came from.
// v1.12: { images: [up to 4] } instead of { image }: several photos of the same meal or product, read together. And { kind: "workout",
// images, ctx } reads screenshots from a watch or fitness app after a workout: calories, heart rate, zones, duration and the rest.
// v1.13: { kind: "day", images, ctx } reads a whole day's activity summary: steps, the day's total and active calories, heart rate,
// zones, sleep and the date shown.
// v1.20: { kind: "machine", images, list } reads a photo of a gym machine: what it is, which of the person's library exercises
// (list = "id|name" lines) are done on it, a few others, and setup tips. (v1.20 to v1.21.1 also had a coach chat, kind "coach",
// taken out in 1.21.2 at the owner's request; such a request is now an ordinary one without a photo.)
// 18 Nov 2026 (server only): when the AI account has no credit left (Claude's monthly API credits used up), people are told
// "The app's AI allowance for this month is used up" and what to type instead, not "couldn't use that photo".

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
// messages written for people; the app shows `message` as it is
const say = (status: number, message: string, reason: string, detail?: string) => json(status, { code: 'P0001', message, reason, detail });

const MODELS: Record<string, string> = { gemini: 'gemini-flash-latest', claude: 'claude-haiku-5-5', openai: 'gpt-6-luna' };
const MEAL_HEAD = `You are reading a photo of a meal for a calorie log.
List each distinct food or drink you can see. For each one give a short name that includes the portion you see (for example "Rice, 1 cup" or "Roti, 2"), your best estimate of its calories in kcal, and its protein, carbohydrates, fat and fibre in grams.
For a curry or gravy with meat, fish, eggs or paneer, say in the name how many pieces you can see and how much gravy (for example "Chicken curry, 3 pieces with 1 katori gravy"), and count fried or grilled pieces the same way (for example "Chicken tikka, 6 pieces").
Indian home and restaurant dishes are common. Use the plate, bowl, hand or cutlery for scale. Count the oil, ghee or butter a dish is usually cooked with.
Give one realistic number per item, not a range. Do not add items you cannot see.
If the photo shows no food or drink, return an empty list.`;
const MEAL_SHAPE = `{"items":[{"name":"Rice, 1 cup","kcal":205,"protein":4,"carbs":45,"fat":0.4,"fibre":0.6}],"note":"one short sentence on what was hard to judge, or an empty string"}`;
const LABEL_HEAD = `You are reading a photo of the label on a supplement or food packet (for example whey protein, creatine, a mass gainer or a protein bar) for a nutrition log.
Find: the brand; the product name; what kind it is ("protein" for protein powders and gainers, "creatine" for creatine, "other" for anything else); the serving size exactly as printed (for example "1 scoop (33 g)"); the weight of one serving in grams; and the nutrition values for ONE SERVING: energy in kcal, protein, carbohydrates, fat and dietary fibre in grams, and creatine in grams when the label lists it.
If the table gives only "per 100 g", work out one serving from the serving weight. If energy is only in kJ, divide by 4.184.
Copy numbers from the label; never invent a number that is not printed or cannot be worked out from it: use null instead.
If the photo shows no label with nutrition information, use null for every field.`;
const LABEL_SHAPE = `{"label":{"brand":"","product":"","kind":"protein","serving_label":"1 scoop (33 g)","serving_g":33,"kcal":130,"protein":25,"carbs":3,"fat":2,"fibre":0,"creatine_g":null,"servings_per_pack":30,"net_g":1000},"note":"one short sentence on anything unclear, or an empty string"}`;
// v1.10: a vitamin or mineral label (only apps from v1.10 send kind "supp")
const SUPP_HEAD = `You are reading a photo of the label on a vitamin, mineral, fish-oil or plant omega-3 supplement (for example a multivitamin, vitamin D3, B12, a B-complex, zinc, iron, calcium, magnesium, vitamin C, biotin, folic acid, fish or algae oil, or flaxseed oil) for a nutrition log. Indian packs often list it as "Each tablet contains" or "Composition".
Find: the brand; the product name; what one unit is ("tablet", "capsule", "softgel", "sachet", "gummy", "ml", "drop" or "strip" for an oral strip or melt); the serving exactly as printed (for example "1 tablet"); and, for ONE tablet, capsule, softgel, sachet, gummy, ml, drop or strip, every vitamin and mineral on the label with its amount and its unit (mg, mcg or IU) as printed.
Give each one a key: va vitamin A (retinol, retinyl acetate or palmitate), bc beta-carotene, vd vitamin D (D2 or D3, cholecalciferol), ve vitamin E (tocopherol or tocopheryl acetate), vk vitamin K (K1 or K2), vc vitamin C (ascorbic acid or sodium ascorbate), b1 thiamine, b2 riboflavin, b3 niacin or nicotinamide, b5 pantothenic acid or calcium pantothenate, b6 pyridoxine, b7 biotin, b9 folic acid or folate, b12 vitamin B12 (cyanocobalamin or methylcobalamin), ca calcium, fe iron, mg magnesium, zn zinc, k potassium, na sodium, ph phosphorus, se selenium, cu copper, mn manganese, io iodine, o3 omega-3 as EPA and DHA added together (fish, krill or algae oil), al plant omega-3 ALA (alpha-linolenic acid, from flaxseed / linseed, chia or perilla oil).
For omega-3: when EPA and DHA are printed, o3 is their sum; when a flaxseed, linseed or chia product prints "omega-3" or "ALA", that amount is al, not o3; never count the weight of the whole oil as omega-3. Leave out omega-6 and omega-9.
When the label gives the element itself (for example "zinc sulphate monohydrate 61.8 mg eq. to elemental zinc 22.5 mg", or "iron 50 mg"), use that amount, not the weight of the salt. When it prints only a salt's weight, work out the element with its usual share of the weight (zinc sulphate monohydrate 36%, zinc oxide 80%, zinc gluconate 14%, ferrous fumarate 33%, ferrous sulphate 20%, dried ferrous sulphate 33%, ferrous bisglycinate 20%, calcium carbonate 40%, calcium citrate 21%, magnesium oxide 60%, magnesium glycinate 14%, magnesium citrate 16%) and say so in the note.
If the amounts are for more than one unit (for example "per 2 tablets"), divide them so they are for ONE unit.
Leave out everything without one of these keys (herbs, ginseng, amino acids, probiotics, enzymes, chromium, molybdenum and so on). Copy numbers from the label; never invent a number: leave that one out instead.
If the photo shows no supplement label, return an empty list.`;
const SUPP_SHAPE = `{"supp":{"brand":"","product":"","form":"tablet","serving_label":"1 tablet","items":[{"key":"vd","name":"Vitamin D3 (Cholecalciferol)","amount":400,"unit":"IU"},{"key":"zn","name":"Zinc","amount":22.5,"unit":"mg"}]},"note":"one short sentence on anything unclear, or an empty string"}`;
const REPLY = '\nReply with JSON only, in exactly this shape:\n';
// apps before v1.8.1 get the v1.8 prompt word for word (without the v1.11 sentence on pieces)
const MEAL_HEAD_V18 = MEAL_HEAD.replace(/\nFor a curry or gravy with meat[^\n]*/, '');
const PROMPT = MEAL_HEAD_V18 + REPLY + MEAL_SHAPE, LABEL = LABEL_HEAD + REPLY + LABEL_SHAPE;      // what apps before v1.8.1 get, word for word

// v1.8.1: questions when the photo leaves something open that matters
const plural = (n: number) => (n === 1 ? 'one short question' : `up to ${n} short questions`);
const HOW_TO_ASK = (thing: string, example: string) => `Write each question so the person knows exactly what you mean, naming the thing in the photo (for example "${thing}"), and give 2 to 4 short answer choices, the most likely first. The app adds its own box for a different answer and a button to skip, so never add "Other", "Not sure" or "Skip" as a choice. Set "multi" to true only when more than one choice can be true at once.
Write each question like this: ${example}
Ask the most important question first. Most clear photos need no questions: then "questions" is an empty list.`;
const ASK_MEAL = (n: number) => `
You may ask the person ${plural(n)} before they log this, but only when the photo really leaves open something that changes the calories a lot. Never ask about what is clear. Only ask about:
- what a food or drink is, when it could be one of a few things that differ a lot (for example plain rice or upma, chicken or paneer, dal or sambar);
- how much there was, when nothing in the photo shows the size, or part of it is hidden (for example how many rotis are in the stack, or how big the glass is);
- how it was cooked, when that changes the calories a lot (for example fried or steamed, oil or ghee, homemade or from a restaurant);
- extras you cannot see that are common and add calories (for example sugar in tea or coffee, ghee on top, a sauce or chutney on the side);
- snacks, when the photo does not show it: whether the snack is homemade or packaged; for a homemade or loose fried snack, the oil it was fried in (for example groundnut, coconut, sunflower or palm oil, or ghee) and whether it was fried, baked or air-fried; for a packet, how much of it was eaten (for example a few pieces, half or all of it).
${HOW_TO_ASK('the white dish on the left', '{"q":"What is the white dish on the left?","options":["Plain rice","Upma","Curd rice"],"multi":false}')}
Even when you ask, still give your best-guess items, so a person who skips the questions has something to log.`;
const ASK_SUPP = (n: number) => `
You may ask the person ${plural(n)} before they save this, but only when the photo really leaves open something that changes the numbers: for example an amount or unit that is blurred or cut off, or whether the amounts are for one tablet or for a serving of two. Never ask about anything printed clearly.
${HOW_TO_ASK('the vitamin D line', '{"q":"The amount of vitamin D3 is blurred. How much does one tablet have?","options":["400 IU","1000 IU","2000 IU"],"multi":false}')}
Even when you ask, still give everything you could read, so a person who skips the questions has something to save.`;
const ASK_LABEL = (n: number) => `
You may ask the person ${plural(n)} before they save this, but only when the photo really leaves open something that changes the name or the numbers: for example which product or flavour it is when that is cut off or blurred, how big one serving or scoop is when that cannot be read, or whether a column is per serving or per 100 g when that is not clear. Never ask about anything printed clearly.
${HOW_TO_ASK('the serving size in the table', '{"q":"The serving size in the table is blurred. How much does one scoop weigh?","options":["30 g","33 g","35 g"],"multi":false}')}
Even when you ask, still give everything you could read, so a person who skips the questions has something to save.`;
const QSHAPE = (shape: string) => shape.replace(/}$/, ',"questions":[]}');
// v1.9: snacks, for apps that let the AI ask (old apps keep PROMPT word for word)
const SNACKS = `
Snacks are common too, both homemade (for example murukku, mixture, thattai, banana chips, bajji, samosa, sundal, laddu) and packaged (for example chips, namkeen, biscuits, chocolate). For a packet whose brand and flavour you can read, use that product's usual nutrition and count only what was eaten, not the whole packet unless it was all eaten. A snack fried in oil holds much more fat than a baked or air-fried one.`;
// the second read: the person's answers to those questions
type Kind = 'meal' | 'label' | 'supp';
const TOLD = (answers: { q: string; a: string }[], isLabel: boolean) => `
You asked the person about this photo, and these are their answers:
${answers.map(x => `- ${x.q} Answer: ${x.a}`).join('\n')}
Treat their answers as true and use them for the ${isLabel ? 'name, serving size and numbers' : 'names, portions and numbers. Count what they told you about even when it cannot be seen in the photo (for example sugar stirred into tea, or the oil a snack was fried in)'}. Where the answer is "Not sure", use your best guess. Do not ask anything more.`;
// v1.12: each item's weight, for apps that send { grams: 1 } (older apps keep their prompts word for word)
const GRAMS = `
For each item also give "grams": how much of it there is as served, in grams (millilitres for a drink), your best estimate from the photo.`;
const withGrams = (shape: string) => shape.replace('{"name":"Rice, 1 cup","kcal":205', '{"name":"Rice, 1 cup","grams":160,"kcal":205');
// v1.26: nutrients first. Apps that send { nut: 1 } get each food's weight and what 100 g of it holds, and the calories are
// calculated here from those (4 kcal a gram of protein and of carbohydrate, 9 of fat, 2 of fibre, 7 of alcohol), never guessed.
// A packet whose printed nutrition table can be read is copied, not estimated. Older apps keep their prompts word for word.
export const NUT_HEAD = `You are reading a photo of a meal for a calorie log. The app calculates the calories itself from what you find, so never give calories for a food you estimate. Work in this order for each distinct food or drink you can see:
1. What it is and how it was cooked: a short name that includes the portion you see (for example "Rice, 1 cup" or "Roti, 2").
2. "grams": how much of it there is as served, in grams (millilitres for a drink), judged from the plate, bowl, hand or cutlery.
3. "per100": what 100 g (100 ml for a drink) of that food holds, cooked and served the way you see it: protein, carbohydrate without its fibre, fat, fibre and alcohol, each in grams. Use what food composition tables give for that food as cooked, and count the oil, ghee, butter, cream or sugar it is usually made with.
For a curry or gravy with meat, fish, eggs or paneer, say in the name how many pieces you can see and how much gravy (for example "Chicken curry, 3 pieces with 1 katori gravy"), and count fried or grilled pieces the same way (for example "Chicken tikka, 6 pieces"); its "per100" is for the dish as a whole, pieces and gravy together.
Indian home and restaurant dishes are common.
A packaged food or drink whose printed nutrition table can be read in the photo is copied, not estimated. Instead of "per100" give it "label", like this: {"name":"Protein bar (the brand and flavour you can read), 1 bar","grams":60,"label":{"basis":"100 g","kcal":380,"protein":33,"carbs":35,"fat":12,"fibre":8,"serving_g":60,"pack_g":60}}. "basis" says what the copied column is for: exactly "100 g", "100 ml" or "serving"; use the per 100 g or per 100 ml column when the table has one. "kcal", "protein", "carbs", "fat" and "fibre" are the numbers printed for that basis (energy in kcal; when only kJ is printed, divide it by 4.184), with null for one that is not printed. "serving_g" is the size of one serving and "pack_g" the net weight or volume of the whole pack, in grams or millilitres, when printed, otherwise null. Its "grams" is how much of it the person is having: what the photo shows (for example one bar from a box, or the glass that was poured), or one serving when the photo cannot show that.
Give one realistic number for each, not a range. Do not add items you cannot see. The examples only show the shape: never reuse their names or numbers.
If the photo shows no food or drink, return an empty list.`;
const NUT_SHAPE = `{"items":[{"name":"Rice, 1 cup","grams":160,"per100":{"protein":2.7,"carbs":28,"fat":0.3,"fibre":0.4,"alcohol":0}}],"note":"one short sentence on what was hard to judge, or an empty string"}`;
// v1.29 "How was it made?": what a photo can't show in a cooked or put-together dish, each kind with the types the app knows.
// The app asks the person how much went in (or uses this guess) and adds each as its own line from its food list.
export const HID_KINDS: Record<string, string[]> = {
  fat: ['sunflower oil', 'groundnut oil', 'mustard oil', 'rice bran oil', 'olive oil', 'coconut oil', 'sesame oil', 'soybean oil', 'vegetable oil', 'butter', 'unsalted butter', 'ghee'],
  salt: ['salt', 'rock salt', 'black salt', 'low sodium salt'],
  pepper: ['black pepper'],
  sugar: ['white sugar', 'brown sugar', 'jaggery', 'honey', 'sweetener'],
  milk: ['full cream milk', 'toned milk', 'double toned milk', 'skimmed milk', 'buffalo milk', 'soy milk', 'almond milk', 'oat milk'],
  sauce: ['mayonnaise', 'eggless mayonnaise', 'tomato ketchup', 'green chutney', 'tamarind chutney', 'coconut chutney', 'schezwan sauce', 'soy sauce', 'vinaigrette', 'creamy dressing'],
  cheese: ['processed cheese', 'mozzarella', 'cheddar', 'cheese spread'],
  cream: ['fresh cream', 'malai', 'whipped cream'],
};
export const HID_RULES = `
How it was made: for each dish that was cooked or put together (an omelette, a curry, a sabzi, dal, a paratha, a sandwich, a salad, tea or coffee, a shake), also list in "hidden" what was added to it that a photo cannot show reliably, so the person can be asked how much they used. Only these kinds, and only the ones this dish really has: ${Object.entries(HID_KINDS).map(([k, t]) => `"${k}" (${t.join(', ')})`).join('; ')}. For each give "kind", "type" (exactly one of the words listed for that kind: your best guess of which one) and "grams": your best estimate of how much is in the whole portion you see (millilitres for milk). The fat it was fried or cooked in counts, and so does butter or ghee put on top; sugar and milk in a drink count too.
For a dish with "hidden", its "grams" and "per100" are for the dish WITHOUT the hidden ingredients you listed (they are counted separately): this replaces the rule above about counting the oil, ghee, butter, cream or sugar it is usually made with. A food with nothing hidden (fruit, plain rice, roti without ghee, a packet) gets no "hidden".`;
const NUT_HID_SHAPE = `{"items":[{"name":"Omelette, 2 eggs with onion","grams":110,"per100":{"protein":11.5,"carbs":2.5,"fat":9,"fibre":0.4,"alcohol":0},"hidden":[{"kind":"fat","type":"butter","grams":5},{"kind":"salt","type":"salt","grams":1.5},{"kind":"pepper","type":"black pepper","grams":0.3}]}],"note":"one short sentence on what was hard to judge, or an empty string"}`;
// the hidden list, checked: known kinds and types only (an unknown type becomes the kind's first), one of each kind, sensible grams
export function tidyHidden(list: unknown): { kind: string; type: string; grams: number }[] {
  const out: { kind: string; type: string; grams: number }[] = [];
  for (const x of (Array.isArray(list) ? list : []).slice(0, 12) as any[]) {
    const kind = String((x && x.kind) || '').toLowerCase().trim(), types = HID_KINDS[kind];
    if (!types || out.some(o => o.kind === kind)) continue;
    const t = String((x && x.type) || '').toLowerCase().replace(/\s+/g, ' ').trim(), type = types.includes(t) ? t : types[0];
    const g = n0(x && (x.grams ?? x.g ?? x.ml), 0.05, kind === 'milk' ? 1000 : 300, 2); if (g == null) continue;
    out.push({ kind, type, grams: g });
  }
  return out;
}
// v1.12: a dish from a restaurant, cafe or shop, looked up on the web
export const WEB_HEAD = (q: string, where: string) => `You are looking up the nutrition of one dish or drink from a restaurant, cafe, sweet shop or takeaway in India, for a calorie log.
The person typed: "${q}"${where ? `, from "${where}"` : ''}.
Search the web for it. Use the best source you can find, in this order: the restaurant's own website, app, menu or nutrition sheet (chains in India must show each item's calories per serving, with the serving size); the restaurant's listing on Swiggy or Zomato; then a nutrition database's entry for the same item from the same restaurant. When a chain sells the dish in India, use the Indian version, not another country's.
Give the numbers for one serving as the restaurant serves it. When a source gives only the calories, keep those calories, work out the protein, carbohydrates and fat from what the dish is made of, and list what you worked out in "estimated".
If you cannot find this dish, set "found" to false, leave the numbers at 0, and put up to 3 close matches you did find in "alts".`;
const WEB_SHAPE = `{"found":true,"name":"Chicken Zinger Burger","place":"KFC India","serving":"1 burger (180 g)","grams":180,"kcal":467,"protein":21,"carbs":45,"fat":22,"fibre":2,"basis":"restaurant","estimated":["fibre"],"note":"one short sentence on where the numbers came from","alts":[]}
"basis" is "restaurant" (its own website, app, menu or sheet), "delivery app" (Swiggy or Zomato), "database" or "estimate".`;
// v1.25: the menu a restaurant serves now, from the web (names and, where the menu shows them, calories; nothing worked out)
export const MENU_HEAD = (place: string, where: string) => `You are finding the menu that a restaurant, cafe, sweet shop or takeaway in India serves right now, for a calorie log.
The person typed: "${place}"${where ? `, in or near "${where}"` : ''}.
Search the web for its current menu. Use the best source you can find, in this order: the restaurant's own website, app, menu or nutrition sheet; its listing on Swiggy or Zomato; then a recent menu page on another site. When it is a chain that sells in India, use the Indian menu, not another country's. Prefer the newest menu you can find, and say in "as_of" how recent it is when the page says.
List what it sells, grouped the way the menu groups it (for example "Hot coffee", "Burgers", "Sides"). Give each item the name the menu uses. Where the menu or nutrition sheet shows an item's calories, give them with the serving they are for; where it does not, leave "kcal" out. Do not work out calories yourself, and do not add items that are not on the menu. At most 100 items: when the menu is longer, keep the most ordered ones from every group and set "more" to true.
If you cannot find this place's menu, set "found" to false and put up to 3 places with close names that you did find in "alts".`;
const MENU_SHAPE = `{"found":true,"place":"Example Cafe India","as_of":"2026","basis":"restaurant","more":false,"groups":[{"name":"Hot coffee","items":[{"name":"Cappuccino","serving":"Regular, 250 ml","kcal":120,"veg":true},{"name":"Americano"}]}],"note":"one short sentence on where the menu came from","alts":[]}
"basis" is "restaurant" (its own website, app, menu or sheet), "delivery app" (Swiggy or Zomato) or "other site". "veg" is true for a vegetarian item and false for the rest; leave it out when the menu does not say. The example only shows the shape: never reuse its names or numbers.`;
// v1.25: one item with the ways it can be ordered (sizes with their own numbers; every other choice as what it changes)
export const ORDER_HEAD = (q: string, place: string) => `You are looking up one item from a restaurant, cafe, sweet shop or takeaway in India, with the ways it can be ordered, for a calorie log.
The person typed: "${q}"${place ? `, from "${place}"` : ''}.
Search the web for it. Use the best source you can find, in this order: the restaurant's own website, app, menu or nutrition sheet (chains in India must show each item's calories per serving, with the serving size); the restaurant's listing on Swiggy or Zomato; then a nutrition database's entry for the same item from the same restaurant. When a chain sells the item in India, use the Indian version, not another country's.
First give the numbers for the item as it is served when nothing is changed (its usual size and usual recipe), and say in "build" what that is. When a source gives only the calories, keep those calories, work out the protein, carbohydrates and fat from what the item is made of, and list what you worked out in "estimated".
Then list in "groups" the choices this place offers for it: its sizes, and what can be swapped, added or left out (for a drink: milk, extra shots, syrups, sugar, toppings; for food: base or bread, cheese, sauces, add-ons).
- In the group of sizes ("sizes": true), give each size the numbers of the whole item at that size, with its "ml" or "grams".
- In every other group, give each choice what it changes compared with the item as usually served: the calories, protein, carbohydrates and fat it adds, with minus numbers when it takes some away. The usual choice changes nothing, so its numbers are 0. Set "scales" to true when the change grows with the size (a different milk does; one extra shot does not).
- Use the restaurant's own numbers where it publishes them. Where it does not, work the change out from what the choice is made of and how much of it goes into the usual size, and set "est" to true on that choice.
- Set "usual" to true on the choice the item comes with. Set "sel" to true on the choices the person asked for in what they typed.
- "one" is true when only one choice of the group can be picked (size, milk), false when several can (add-ons).
List only choices this place really offers, at most 6 groups and 10 choices in a group; an item with no choices gets an empty list.
If you cannot find this item, set "found" to false, leave the numbers at 0, and put up to 3 close matches you did find in "alts".`;
const ORDER_SHAPE = `{"found":true,"name":"Farm Pizza","place":"Example Pizza India","build":"Regular, classic crust","serving":"Regular (4 slices, 300 g)","grams":300,"kcal":700,"protein":30,"carbs":90,"fat":24,"fibre":6,"basis":"restaurant","estimated":["fibre"],"groups":[{"name":"Size","one":true,"sizes":true,"options":[{"name":"Regular","grams":300,"kcal":700,"protein":30,"carbs":90,"fat":24,"usual":true},{"name":"Medium","grams":520,"kcal":1210,"protein":52,"carbs":156,"fat":42,"sel":true}]},{"name":"Crust","one":true,"options":[{"name":"Classic","kcal":0,"protein":0,"carbs":0,"fat":0,"usual":true},{"name":"Cheese burst","kcal":230,"protein":9,"carbs":6,"fat":18,"scales":true,"est":true,"sel":true}]},{"name":"Add-ons","one":false,"options":[{"name":"Extra cheese","kcal":90,"protein":6,"carbs":1,"fat":7,"scales":true,"est":true}]}],"note":"one short sentence on where the numbers came from","alts":[]}
"basis" is "restaurant" (its own website, app, menu or sheet), "delivery app" (Swiggy or Zomato), "database" or "estimate". The example only shows the shape: never reuse its names or numbers.`;
// v1.25: a recipe from photos or pasted text. Only what goes in and how much: the app counts it from its own food list.
export const RECIPE_HEAD = (n: number, text: string) => `You are reading a recipe ${text ? 'that the person pasted as text' : (n === 1 ? 'from a photo' : 'from ' + n + ' photos') + ' (a cookbook page, a screenshot, a handwritten card or the back of a packet)'}, for a calorie log.${text ? `
The recipe:
"""
${text}
"""` : ''}
List every ingredient that ends up in the dish, each with its weight in grams (millilitres for a liquid) for the whole recipe as written. Turn cups, spoons, pieces and handfuls into grams with the usual weight of that ingredient (1 cup of uncooked rice is about 185 g, 1 tablespoon of oil about 14 g, 1 medium onion about 110 g, 1 egg about 50 g). Name each ingredient plainly, as a food ("Paneer", "Basmati rice, uncooked", "Ghee", "Onion"), raw or uncooked unless the recipe starts from a cooked or ready-made food. Leave out water, salt, and spices and herbs used by the pinch or spoon; keep oil, ghee, butter, sugar, cream, nuts and everything else that has calories. For oil used for deep frying, count only what the food soaks up (about a tenth of the food's weight).
Say how many servings the recipe says it makes. When it does not say, give your best estimate of how many people it feeds and set "serves_guess" to true.
Do not give calories or any other nutrition numbers.
If this is not a recipe, set "is_recipe" to false.`;
const RECIPE_SHAPE = `{"is_recipe":true,"name":"Paneer butter masala","serves":4,"serves_guess":false,"items":[{"name":"Paneer","grams":250},{"name":"Butter","grams":30},{"name":"Tomato","grams":400}],"note":"one short sentence, for example about anything you could not read"}`;
// v1.28: a recipe from a link (a blog, a YouTube video's description, a post): the page is opened with the web fetch tool
export const RECIPE_URL_HEAD = (url: string) => `You are reading a recipe from a web page, for a calorie log. Open this page with the web fetch tool: ${url}
It may be a recipe blog, a YouTube video (the recipe is often in its description) or a social media post. If the page cannot be opened, you may search the web for the same recipe by the same author, but never make one up.
List every ingredient that ends up in the dish, each with its weight in grams (millilitres for a liquid) for the whole recipe as written. Turn cups, spoons, pieces and handfuls into grams with the usual weight of that ingredient (1 cup of uncooked rice is about 185 g, 1 tablespoon of oil about 14 g, 1 medium onion about 110 g).
Say how many servings the recipe says it makes. When it does not say, give your best estimate of how many people it feeds and set "serves_guess" to true.
Do not give calories or any other nutrition numbers.
If there is no recipe to read, set "is_recipe" to false and say why in "note" (for example "The page needs a login").`;
// v1.28: an order screenshot (a delivery app's order or a bill): the items as ordered, then each one's numbers from the web
export const SHOT_HEAD = (n: number) => `You are reading ${n === 1 ? 'a screenshot' : n + ' screenshots'} of a food order from a delivery app or a restaurant in India (for example Swiggy, Zomato, EatSure or a printed bill), for a calorie log.
First read the restaurant's name and every food or drink ordered, with its quantity and the size, add-ons and changes shown for it. Leave out delivery fees, taxes, tips, packaging and offers.
Then search the web for the nutrition of each item at that restaurant. Use the best source you can find, in this order: the restaurant's own nutrition information (chains in India must show each item's calories per serving), its Swiggy or Zomato listing, then a nutrition database's entry for the same dish. When it is a chain that sells in India, use the Indian menu.
For each item give the numbers for ONE of it as ordered (its size and changes): "kcal", "protein", "carbs" and "fat" in grams, and "grams" (millilitres for a drink), the weight of one. When a source gives only the calories, keep those and work out the rest from what the dish is made of. Set "est" to true on an item whose calories you worked out rather than found, and say in "basis" where the calories came from: "restaurant", "delivery app", "other site" or "estimate".
If the screenshots do not show a food order, set "found" to false.`;
const SHOT_SHAPE = `{"found":true,"place":"Example Restaurant","app":"Swiggy","items":[{"name":"Paneer tikka","qty":1,"build":"Full, extra cheese","grams":250,"kcal":420,"protein":24,"carbs":18,"fat":28,"est":false,"basis":"restaurant"}],"note":"one short sentence on anything unclear, or an empty string"}
The example only shows the shape: never reuse its names or numbers.`;
// v1.28: a packet's nutrition table for comparing two products: per 100 g (or ml), with sugars and salt
export const PACK_HEAD = (n: number) => `You are reading the nutrition table on a food or drink packet${n > 1 ? ` (${n} photos of the same packet, for example the front and the back)` : ''}, to compare it with another product.
Copy the per 100 g column (per 100 ml for a drink) when the table has one, and set "basis" to "100 g" or "100 ml". Otherwise copy the per serving column, set "basis" to "serving" and give "serving_g", the weight of one serving.
Copy: energy in kcal (when only kJ is printed, divide by 4.184), protein, carbohydrate, total sugars, added sugars when printed, fat, saturated fat and dietary fibre in grams, and sodium in mg (or salt in g when that is what is printed). Also the brand, the product name, the net weight or volume of the pack in grams or millilitres, and the MRP in rupees when printed.
Copy numbers from the label; never invent a number that is not printed: use null instead. If the photo shows no nutrition table, use null for every number.`;
const PACK_SHAPE = `{"pack":{"brand":"","product":"","basis":"100 g","kcal":480,"protein":8,"carbs":60,"sugars":20,"added_sugars":null,"fat":22,"sat_fat":10,"fibre":3,"sodium_mg":450,"salt_g":null,"serving_g":30,"net_g":90,"mrp":20},"note":"one short sentence on anything unclear, or an empty string"}`;
// v1.28: a workout program from photos (a gym whiteboard, a printed plan, a screenshot of a post) or pasted text
export const PROGRAM_HEAD = (n: number, text: string) => `You are reading a gym workout program ${text ? 'that the person pasted as text' : (n === 1 ? 'from a photo' : 'from ' + n + ' photos') + ' (a gym whiteboard, a printed plan or a screenshot of a post)'}, to set it up in a workout log.${text ? `
The program:
"""
${text}
"""` : ''}
List each training day in order with a short name (for example "Push", "Day 2: Legs" or "Monday: Back and biceps"), and for each exercise on that day: its name in plain words, the way gyms usually call it (for example "Barbell bench press", "Lat pulldown", "Plank"), the number of sets, and the reps. For a range of reps such as "8-12" give "reps": 8 and "reps_hi": 12. For an exercise done for time give "secs" instead of reps. Add a short "note" only when the program writes one (for example "pause at the bottom").
Leave out warm-ups, rest times and cardio unless they are written as exercises. Keep the program's own order.
If this is not a workout program, set "is_program" to false.`;
const PROGRAM_SHAPE = `{"is_program":true,"name":"Push pull legs","days":[{"name":"Push","items":[{"name":"Barbell bench press","sets":4,"reps":8,"reps_hi":10,"note":""},{"name":"Plank","sets":3,"secs":45}]}],"note":"one short sentence on anything unclear, or an empty string"}
The example only shows the shape: never reuse its names or numbers.`;
// v1.25: what is in the fridge or on the shelf, and what could be made from it. Again no numbers: the app counts each dish.
export const FRIDGE_HEAD = (n: number, ctx: string) => `You are looking at ${n === 1 ? 'a photo' : n + ' photos'} of the inside of a fridge, a kitchen shelf, a counter or a shopping bag. The person wants ideas for what to cook or put together now from what they have.${ctx ? ` About the person: ${ctx}.` : ''}
First list in "seen" the foods you can make out (plain names, at most 30; only what you can really see or read on a label).
Then suggest up to 6 dishes or meals that can be made mostly from those foods plus kitchen basics (oil, salt, spices, flour, rice, onions), the kind of food eaten at home in India unless what you see points elsewhere. For each give: its name; "uses": which of the seen foods go into it; "items": what one serving is made of when it is eaten, as separate foods with grams, the way a calorie log lists a meal (for example "Palak paneer" 200 g and "Roti" 60 g), with ordinary dish names; "mins": about how many minutes it takes; and "how": 2 to 4 very short steps. Put dishes with more protein first.
Do not give calories or any other nutrition numbers.
If no food can be seen, set "is_food" to false.`;
const FRIDGE_SHAPE = `{"is_food":true,"seen":["Eggs","Paneer","Spinach","Curd"],"dishes":[{"name":"Palak paneer with rotis","uses":["Paneer","Spinach"],"items":[{"name":"Palak paneer","grams":200},{"name":"Roti","grams":60}],"mins":30,"how":["Blanch and blend the spinach","Fry onion, garlic and spices","Add the paneer and simmer"]}],"note":""}`;
// v1.12: several photos at once (one image keeps its prompt word for word)
export const MANY = (n: number, isLabel: boolean) => isLabel
  ? `\nThere are ${n} photos of the same product (for example the front and the back of the pack). Read them together as one label.`
  : `\nThere are ${n} photos of the same meal (different dishes, or the same food from different sides). Read them together and list each food once, even when it shows in more than one photo.`;
// v1.12: screenshots from a watch or fitness app after a workout
export const WORKOUT_HEAD = (n: number, ctx: string) => `You are reading ${n === 1 ? 'a screenshot' : n + ' screenshots'} from a fitness watch or a fitness app (for example Samsung Health, Google Fit, Fitbit, Garmin Connect, Apple Fitness, Zepp or Amazfit, Noise, boAt or Mi Fitness) after one gym workout, for a workout log.
Read every number that is shown: calories, average, highest and lowest heart rate, the workout's duration, the time in each heart-rate zone with its range, steps, distance, and anything else shown (for example training effect, training load, recovery time, VO2 max, SpO2 or stress).
Read only what is shown. Never guess a number that isn't on the screenshots: use null. If they show more than one workout, use the one that matches the workout below, else the most recent one.${ctx ? `\nThe workout in the log: ${ctx}.` : ''}`;
const WORKOUT_SHAPE = `{"app":"Samsung Health","kcal":312,"kcal_kind":"active","avg_hr":128,"max_hr":171,"min_hr":82,"duration_min":58,"zones":[{"name":"Zone 2 (fat burn)","min":21,"low":115,"high":137}],"steps":null,"distance_km":null,"other":[{"name":"Training effect","value":"3.1 aerobic"}],"note":"one short sentence on what the screenshots show, or what was hard to read"}
"kcal_kind" is "active" when the calories are active or workout calories, "total" when they include the calories burnt at rest, or "" when the screenshots don't say.`;
// v1.13: screenshots of a whole day's activity summary
export const DAY_HEAD = (n: number, ctx: string) => `You are reading ${n === 1 ? 'a screenshot' : n + ' screenshots'} of a fitness watch's or fitness app's activity summary for one whole day (for example Samsung Health's Today screen, Google Fit's Home, Fitbit's Today, Garmin's My Day, Apple's Activity rings, Zepp or Amazfit, Noise, boAt or Mi Fitness), for a calorie log.
Read every number that is shown: the date; steps; distance; the day's total calories burnt, which includes what the body burns at rest (often called total, burned or energy burned), and active calories, from movement and exercise only (often called active, move or activity calories); active or exercise minutes; floors; heart rate (resting, average, highest and lowest); the time in each heart-rate zone with its range; sleep (time asleep, the sleep score, deep and REM sleep); heart-rate variability (HRV, in ms); and anything else shown (for example stress, SpO2, an energy or readiness score, VO2 max).
Read only what is shown. Never guess a number that isn't on the screenshots: use null. A calorie number that isn't labelled as total or active goes in kcal_total only when the screen says it is the whole day's burn, else in kcal_active.
If the screenshots show a single workout rather than a whole day, set "shows" to "workout".${ctx ? `\n${ctx}. Give the date as YYYY-MM-DD when the screenshots show it (a weekday, "Today" or "Yesterday" is enough with that), else null.` : ''}`;
const DAY_SHAPE = `{"shows":"day","app":"Samsung Health","date":"2026-11-16","date_text":"Mon, 16 Nov","steps":8432,"distance_km":6.1,"kcal_total":2310,"kcal_active":540,"active_min":64,"floors":null,"hr_rest":62,"hr_avg":78,"hr_max":164,"hr_min":55,"zones":[{"name":"Zone 2 (fat burn)","min":45,"low":115,"high":135}],"sleep_min":425,"sleep_score":78,"deep_min":72,"rem_min":95,"hrv_ms":48,"other":[{"name":"Stress","value":"32, low"}],"note":"one short sentence on what the screenshots show, or what was hard to read"}`;
// v1.13: a night's sleep, for the Recovery screen (read with the same tidying as a day)
export const SLEEP_HEAD = (n: number, ctx: string) => `You are reading ${n === 1 ? 'a screenshot' : n + ' screenshots'} of a fitness watch's or fitness app's sleep summary for one night (for example Samsung Health's Sleep, Google Fit, Fitbit's Sleep, Garmin's Sleep or Body Battery, Apple Health's Sleep, Apple Watch's Sleep Score, Sleep Stages and Vitals, Whoop, Oura, Zepp or Amazfit, Noise, boAt or Mi Fitness), for a training-recovery log. Some may be photos of the watch's own screen: read them the same way.
Read every number that is shown: the date the night ended (the morning of waking up); the time actually asleep (not only in bed); the sleep score; the minutes of deep and REM sleep; the bedtime and the wake-up time as clock times (a range such as "1:00 – 8:35 AM" gives both; a score or a comparison such as "7m later than average" is not a time); the resting heart rate (when only the heart rate while asleep is shown, for example Apple Watch's Vitals, give that; never a range such as 37–55); the heart-rate variability (HRV, in ms); the blood oxygen (SpO2, in %); the breathing (respiratory) rate; and anything else shown (for example light or core sleep, time awake, wrist temperature, or a readiness, recovery or body battery score) in "other".
Read only what is shown. Never guess a number that isn't on the screenshots: use null.
If the screenshots show a single workout rather than a night's sleep, set "shows" to "workout".${ctx ? `\n${ctx}. Give the date as YYYY-MM-DD when the screenshots show it (a weekday, "Today", "Last night" or "Yesterday" is enough with that), else null.` : ''}`;
const SLEEP_SHAPE = `{"shows":"day","app":"Samsung Health","date":"2026-11-16","date_text":"Mon, 16 Nov","sleep_min":425,"sleep_score":78,"deep_min":72,"rem_min":95,"bed_time":"11:40 PM","wake_time":"7:10 AM","hr_rest":56,"hrv_ms":48,"spo2":96,"breath_rate":15.2,"other":[{"name":"Light sleep","value":"3 h 58 min"}],"note":"one short sentence on what the screenshots show, or what was hard to read"}`;
// v1.13: what was left on the plate after a meal (the app's Leftovers): the meal's foods, its photo before, the plate after
export const LEFT_HEAD = (nb: number, na: number, lines: { name: string; g: number | null }[]) => `${nb ? `The first ${nb === 1 ? 'photo shows' : nb + ' photos show'} a meal before it was eaten; the last ${na === 1 ? 'photo shows' : na + ' photos show'} what was left of it on the plate afterwards.` : `${na === 1 ? 'The photo shows' : 'The ' + na + ' photos show'} what was left on the plate after a meal was eaten.`} The meal was:
${lines.map((l, i) => `${i + 1}. ${l.name}${l.g ? `, ${l.g} g` : ''}`).join('\n')}
For each food of the meal, estimate how much of it is left: the grams left (when its grams are given) and the share left, from 0 (all of it eaten) to 1 (none of it eaten). Bones, peels, shells, seeds and whole spices that are not eaten are not leftovers. A food that can't be seen on the plate any more is 0.
Read only what is shown; when it is hard to tell, say so in the note.`;
const LEFT_SHAPE = `{"left":[{"i":1,"g":40,"share":0.2},{"i":2,"g":0,"share":0}],"note":"one short sentence on what is left, or what was hard to tell"}`;
// v1.11: a meal eaten out (the app's Eating out button)
export const OUT = `
This meal was eaten out, at a restaurant, dhaba, cafe or takeaway. Restaurant portions are usually bigger than home ones, and restaurant dishes usually have more oil, ghee, butter or cream than the same dish cooked at home: count that.`;
export function promptFor(kind: Kind, ask: number, answers: { q: string; a: string }[], out = false, grams = false, n = 1, nut = false, hid = false): string {
  const isLabel = kind !== 'meal', gr = grams && !isLabel;
  if (n > 1) {                                                   // v1.12: several photos: the same prompt, told how many there are
    const one = promptFor(kind, ask, answers, out, grams, 1, nut, hid), i = one.indexOf(REPLY);
    return one.slice(0, i) + MANY(n, isLabel) + one.slice(i);
  }
  if (nut && !isLabel) {                                         // v1.26: each food's weight and nutrients, never its calories
    const top = NUT_HEAD + (out ? OUT : '') + SNACKS + (hid ? HID_RULES : ''), shape = hid ? NUT_HID_SHAPE : NUT_SHAPE;      // v1.29: how it was made
    return answers.length ? top + TOLD(answers, false) + REPLY + shape : ask > 0 ? top + ASK_MEAL(ask) + REPLY + QSHAPE(shape) : top + REPLY + shape;
  }
  const head = (kind === 'supp' ? SUPP_HEAD : isLabel ? LABEL_HEAD : MEAL_HEAD) + (out && !isLabel ? OUT : '') + (gr ? GRAMS : ''), shape0 = kind === 'supp' ? SUPP_SHAPE : isLabel ? LABEL_SHAPE : MEAL_SHAPE, shape = gr ? withGrams(shape0) : shape0;
  const snacks = isLabel ? '' : SNACKS;
  if (answers.length) return head + snacks + TOLD(answers, isLabel) + REPLY + shape;
  if (ask > 0) return head + snacks + (kind === 'supp' ? ASK_SUPP(ask) : isLabel ? ASK_LABEL(ask) : ASK_MEAL(ask)) + REPLY + QSHAPE(shape);
  return kind === 'supp' ? SUPP_HEAD + REPLY + SUPP_SHAPE : isLabel ? LABEL : out || gr ? head + snacks + REPLY + shape : PROMPT;
}

type Fetch = typeof fetch;
class Upstream extends Error { status: number; constructor(status: number, m: string) { super(m); this.status = status; } }
// v1.9: how long the Gemini reads may take. The app waits 60 s for the whole answer; the tests make these short.
export const LIMITS = { total: 50000, first: 28000, lite: 25000, menu: 110000 };
// the AI account has run out of credit: Claude answers 400 "Your credit balance is too low…", OpenAI 429 "You exceeded your
// current quota…". Both are passed on as 402 so the handlers can say so plainly.
const NO_CREDIT = /credit balance is too low|exceeded your current quota/i;
const SPENT = "The app's AI allowance for this month is used up. ";
const LITE = 'gemini-flash-lite-latest';          // Google's quicker model, tried once when the main one is slow, busy or failing
// what a service said when it refused, trimmed, with anything that looks like a key taken out (it goes to the log only)
async function why(r: Response): Promise<string> {
  let t = ''; try { t = await r.text(); } catch (_e) { /* nothing to read */ }
  let m: unknown = t; try { const j = JSON.parse(t); m = (j && j.error && (j.error.message || j.error.status)) || (j && j.message) || t; } catch (_e) { /* not JSON */ }
  return String(m || r.statusText || 'refused').replace(/AIza[\w-]{10,}|[\w-]{32,}/g, '…').replace(/\s+/g, ' ').trim().slice(0, 200);
}

async function post(f: Fetch, url: string, headers: Record<string, string>, body: unknown, ms = 45000): Promise<any> {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await f(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
    if (!r.ok) { const m = await why(r); throw new Upstream(NO_CREDIT.test(m) ? 402 : r.status, m); }
    return await r.json();
  } catch (e) {
    if (e instanceof Upstream) throw e;
    throw new Upstream(504, ctl.signal.aborted ? `no answer within ${Math.round(ms / 1000)} s` : e instanceof SyntaxError ? 'an answer that was not JSON' : 'no answer');
  } finally { clearTimeout(timer); }
}

// one line in the function's log per Gemini call: never the key, never the photo
const logLine = (key: string, line: string) => (key.length >= 8 ? line.split(key).join('…') : line).slice(0, 300);
type Img = { data: string; mime: string };
async function gemini(f: Fetch, key: string, model: string, fixed: boolean, imgs: Img[], prompt: string): Promise<string> {
  const k = imgs.length > 4 ? 1.5 : 1;                                                   // 1.35.2 (60): up to 10 screenshots take longer to read
  const end = Date.now() + LIMITS.total * k, spare = Math.min(4000, LIMITS.total / 10);     // too little time left to be worth another call
  const call = async (m: string, cap: number): Promise<string> => {
    // Flash thinks at length by default (45 s or more for one photo); asked to think a little it answers in seconds. Flash-Lite already thinks least.
    const think = !/lite/i.test(m), t0 = Date.now();
    const go = (withThink: boolean) => post(f, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, { 'x-goog-api-key': key },
      { contents: [{ parts: [...imgs.map(i => ({ inline_data: { mime_type: i.mime, data: i.data } })), { text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', ...(withThink ? { thinkingConfig: { thinkingLevel: 'low' } } : {}) } },
      Math.max(1, Math.min(cap, end - Date.now())));
    const failed = (e: unknown) => console.error(logLine(key, `gd-meal-photo: ${m} failed after ${Date.now() - t0} ms: ` + (e instanceof Upstream ? `${e.status} ${e.message}` : `error ${String((e as any)?.message || e)}`)));
    let j: any;
    try { j = await go(think); }
    catch (e) {
      failed(e);
      // a model that does not know the thinking setting refuses the whole request: ask once more without it
      if (!(think && e instanceof Upstream && e.status === 400 && end - Date.now() > spare)) throw e;
      try { j = await go(false); } catch (e2) { failed(e2); throw e2; }
    }
    console.log(logLine(key, `gd-meal-photo: ${m} answered in ${Date.now() - t0} ms`));
    return ((((j.candidates || [])[0] || {}).content || {}).parts || []).filter((p: any) => !p.thought).map((p: any) => p.text || '').join('');
  };
  const main = async (): Promise<string> => {
    try { return await call(model, LIMITS.first * k); }
    catch (e) {
      if (!(e instanceof Upstream) || e.status !== 404 || fixed) throw e;
      // the built-in model name has been retired: ask which models this key can use and take the newest Flash one
      const l = await f('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
      if (!l.ok) throw e;
      const names: string[] = (((await l.json()).models) || []).filter((m: any) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m: any) => String(m.name).replace(/^models\//, ''));
      const flash = names.filter(n => /^gemini-[\d.]+-flash(-\d+)?$/.test(n)).sort((a, b) => parseFloat(a.slice(7)) - parseFloat(b.slice(7)));
      const pick = flash.pop() || names.find(n => /flash/.test(n) && !/lite|image|tts|live|audio|embed/.test(n));
      if (!pick || pick === model) throw e;
      return await call(pick, LIMITS.first * k);
    }
  };
  try { return await main(); }
  catch (e) {
    // slow, busy or failing: once more with Flash-Lite. Not for a refused key, a photo the AI won't take, or a model name set by hand that doesn't exist.
    const st = e instanceof Upstream ? e.status : 0;
    if (model === LITE || [400, 401, 403, 404].includes(st) || end - Date.now() < spare) throw e;
    return await call(LITE, LIMITS.lite * k);
  }
}
// 18 Nov 2026: one log line per Claude call too (model, time, tokens; never the key or the photo)
const used = (j: any) => { const u = (j && j.usage) || {}, w = (u.server_tool_use || {}).web_search_requests; return ` (${u.input_tokens || 0} in, ${u.output_tokens || 0} out${w ? `, ${w} searches` : ''})`; };
async function claudeCall(f: Fetch, key: string, body: any, tag: string, ms?: number): Promise<any> {
  const t0 = Date.now();
  let j: any;
  try { j = await post(f, 'https://api.anthropic.com/v1/messages', { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body, ms); }
  catch (e) { console.error(logLine(key, `gd-meal-photo${tag}: ${body.model} failed after ${Date.now() - t0} ms: ` + (e instanceof Upstream ? `${e.status} ${e.message}` : 'error'))); throw e; }
  console.log(logLine(key, `gd-meal-photo${tag}: ${body.model} answered in ${Date.now() - t0} ms` + used(j)));
  return j;
}
async function claude(f: Fetch, key: string, model: string, imgs: Img[], prompt: string): Promise<string> {
  const j = await claudeCall(f, key, { model, max_tokens: 4000, messages: [{ role: 'user', content: [...imgs.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.mime, data: i.data } })), { type: 'text', text: prompt }] }] }, '', imgs.length > 4 ? 70000 : undefined);
  return (j.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text || '').join('');
}
async function openai(f: Fetch, key: string, model: string, fixed: boolean, imgs: Img[], prompt: string): Promise<string> {
  // the built-in model thinks before answering; a little thinking is plenty for a photo and keeps the wait short
  const j = await post(f, 'https://api.openai.com/v1/chat/completions', { Authorization: 'Bearer ' + key },
    { model, ...(fixed ? {} : { reasoning_effort: 'low' }), max_completion_tokens: 4000, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...imgs.map(i => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.data}` } }))] }] }, imgs.length > 4 ? 70000 : 45000);
  return String((((j.choices || [])[0] || {}).message || {}).content || '');
}

// v1.12: the web lookup. Gemini 2.5 Flash has Google Search free up to 500 a day (1,500 on a paid key); the newest Flash only
// on a paid key, so it is the second try. Structured JSON can't be asked for together with search, so the JSON is read from the text.
type Src = { title: string; uri: string };
const WEB_MODEL = 'gemini-2.5-flash';
async function geminiWeb(f: Fetch, key: string, model: string, prompt: string, imgs: Img[] = []): Promise<{ text: string; sources: Src[] }> {
  const end = Date.now() + LIMITS.total;
  const call = async (m: string): Promise<{ text: string; sources: Src[] }> => {
    const t0 = Date.now(), think = /2\.5/.test(m) ? { thinkingConfig: { thinkingBudget: 1024 } } : /lite/i.test(m) ? {} : { thinkingConfig: { thinkingLevel: 'low' } };
    let j: any;
    try { j = await post(f, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, { 'x-goog-api-key': key }, { contents: [{ parts: [...imgs.map(i => ({ inline_data: { mime_type: i.mime, data: i.data } })), { text: prompt }] }], tools: [{ google_search: {} }], generationConfig: think }, Math.max(1, end - Date.now())); }
    catch (e) { console.error(logLine(key, `gd-meal-photo web: ${m} failed after ${Date.now() - t0} ms: ` + (e instanceof Upstream ? `${e.status} ${e.message}` : 'error'))); throw e; }
    console.log(logLine(key, `gd-meal-photo web: ${m} answered in ${Date.now() - t0} ms`));
    const c = (j.candidates || [])[0] || {}, seen = new Set<string>(), sources: Src[] = [];
    for (const x of ((c.groundingMetadata || {}).groundingChunks || [])) {
      const w = x && x.web, uri = String((w && w.uri) || ''), title = words(w && w.title, 80) || 'A web page';
      if (!/^https:\/\//.test(uri) || seen.has(title)) continue; seen.add(title); sources.push({ title, uri }); if (sources.length === 5) break;
    }
    return { text: ((c.content || {}).parts || []).filter((p: any) => !p.thought).map((p: any) => p.text || '').join(''), sources };
  };
  try { return await call(model); }
  catch (e) {
    // the free model retired, or search not allowed on it: once more with the newest Flash (search there needs a paid key)
    if (!(e instanceof Upstream) || ![400, 403, 404].includes(e.status) || model === MODELS.gemini || end - Date.now() < 4000) throw e;
    return await call(MODELS.gemini);
  }
}
// v1.25: a menu takes more searches, a longer answer and sometimes the menu page itself (web fetch: no charge beyond its tokens).
// A turn the API pauses ("pause_turn") is sent back as it came, at most twice, and the pieces are read together.
type WebOpt = { uses?: number; tokens?: number; fetch?: number; ms?: number; imgs?: Img[] };
async function claudeWeb(f: Fetch, key: string, model: string, prompt: string, o: WebOpt = {}): Promise<{ text: string; sources: Src[] }> {
  const end = Date.now() + (o.ms || LIMITS.total);
  const tools: any[] = [{ type: 'web_search_20250305', name: 'web_search', max_uses: o.uses || 3, user_location: { type: 'approximate', country: 'IN' } }];
  if (o.fetch) tools.push({ type: 'web_fetch_20250910', name: 'web_fetch', max_uses: o.fetch, max_content_tokens: 30000 });
  const content = o.imgs && o.imgs.length ? [...o.imgs.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.mime, data: i.data } })), { type: 'text', text: prompt }] : prompt;      // v1.28: pictures too
  const messages: any[] = [{ role: 'user', content }], blocks: any[] = [];
  for (let turn = 0; turn < 3; turn++) {
    let j: any;
    try { j = await claudeCall(f, key, { model, max_tokens: o.tokens || 3000, tools, messages }, ' web', Math.max(1, end - Date.now())); }
    catch (e) {
      // the page reader refused with this key or model: once more with the search alone
      if (!(e instanceof Upstream) || e.status !== 400 || tools.length < 2 || turn) throw e;
      tools.pop(); turn--; continue;
    }
    blocks.push(...(Array.isArray(j.content) ? j.content : []));
    if (j.stop_reason !== 'pause_turn' || end - Date.now() < 3000) break;
    messages.push({ role: 'assistant', content: j.content });
  }
  const sources: Src[] = [], seen = new Set<string>();
  for (const b of blocks) if (b && b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const r of b.content) {
    const uri = String((r && r.url) || ''), title = words(r && r.title, 80) || 'A web page';
    if (/^https:\/\//.test(uri) && !seen.has(uri) && sources.length < 5) { seen.add(uri); sources.push({ title, uri }); }
  }
  return { text: blocks.filter((b: any) => b && b.type === 'text').map((b: any) => b.text || '').join(''), sources };
}

// the AI's answer, checked and trimmed to what the app expects
function parse(text: string): any {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)) || {}; } catch (_e) { return {}; } }
  return {};
}
const g1 = (v: unknown, max: number): number | null => { const n = Number(v); return v != null && v !== '' && isFinite(n) && n >= 0 && n <= max ? Math.round(n * 10) / 10 : null; };
const words = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
type Question = { q: string; options: string[]; multi: boolean };
// the AI's questions: at most `n`, each with up to 4 different choices, and none of the choices the app already offers
export function tidyQuestions(v: unknown, n: number): Question[] {
  const out: Question[] = [];
  if (!(n > 0) || !Array.isArray(v)) return out;
  for (const x of v) {
    if (!x || typeof x !== 'object') continue;
    const q = words((x as any).q ?? (x as any).question, 160); if (!q) continue;
    const raw = Array.isArray((x as any).options) ? (x as any).options : Array.isArray((x as any).choices) ? (x as any).choices : [];
    const options: string[] = [], seen = new Set<string>();
    for (const o of raw) {
      const t = words(typeof o === 'number' ? String(o) : typeof o === 'string' ? o : o && ((o as any).label ?? (o as any).text), 50), k = t.toLowerCase();
      if (!t || seen.has(k) || /^(other|others|something else|not sure|don'?t know|skip)\b/i.test(t)) continue;
      seen.add(k); options.push(t); if (options.length === 4) break;
    }
    const multi = (x as any).multi === true || (x as any).multi === 'true';
    out.push({ q, options, multi: multi && options.length > 1 });
    if (out.length === n) break;
  }
  return out;
}
// what the person answered, as the app sends it back
export function tidyAnswers(v: unknown): { q: string; a: string }[] {
  return (Array.isArray(v) ? v : []).slice(0, 20).map((x: any) => ({ q: words(x && x.q, 160), a: words(x && x.a != null ? String(x.a) : '', 120) || 'Not sure' })).filter(x => x.q).slice(0, 5);
}
export function tidy(text: string, ask = 0): { items: { name: string; kcal: number; protein: number; carbs?: number; fat?: number; fibre?: number }[]; note: string; questions?: Question[] } {
  const j = parse(text);
  const items = (Array.isArray(j.items) ? j.items : []).map((x: any) => ({
    name: String((x && x.name) || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    kcal: Math.round(Number(x && (x.kcal ?? x.calories))), protein: Math.round(Number(x && (x.protein ?? x.p)) * 10) / 10, x,
  })).filter((x: any) => x.name && isFinite(x.kcal) && x.kcal >= 0 && x.kcal <= 5000).slice(0, 12)
    .map((y: any) => {
      const o: any = { name: y.name, kcal: y.kcal, protein: isFinite(y.protein) && y.protein > 0 && y.protein < 500 ? y.protein : 0 };
      for (const [k, alt] of [['carbs', 'c'], ['fat', 'f'], ['fibre', 'fiber']]) { const v = g1(y.x && (y.x[k] ?? y.x[alt]), 1000); if (v) o[k] = v; }      // only what the AI gave
      const gr = g1(y.x && y.x.grams, 5000); if (gr) o.grams = Math.round(gr);                                                                    // v1.12, when asked
      return o;
    });
  return ask > 0 ? { items, note: words(j.note, 200), questions: tidyQuestions(j.questions, ask) } : { items, note: words(j.note, 200) };
}
// v1.26: nutrients first, checked, and the calories calculated from them. Every item comes back with the fields it always had
// (name, grams, kcal, protein, carbs, fat, fibre) and with how it was worked out: "nutrients" (the AI's grams x what 100 g of
// the food holds) or "label" (a packet's printed table x the grams). An item with neither keeps its name and grams and counts
// nothing, so the app can look it up in its own food list.
export const kcalOf = (p: number, c: number, f: number, fib = 0, alc = 0) => 4 * p + 4 * c + 9 * f + 2 * fib + 7 * alc;
type NutItem = { name: string; kcal: number; protein: number; carbs?: number; fat?: number; fibre?: number; alcohol?: number; grams?: number; how?: string; per100?: Record<string, number>; label?: Record<string, unknown>; hidden?: { kind: string; type: string; grams: number }[] };
export function tidyNut(text: string, ask = 0): { items: NutItem[]; note: string; questions?: Question[] } {
  const j = parse(text), r1 = (v: number) => Math.round(v * 10) / 10;
  const items = (Array.isArray(j.items) ? j.items : []).map((x: any): NutItem | null => {
    const name = String((x && x.name) || '').replace(/\s+/g, ' ').trim().slice(0, 60); if (!name) return null;
    const grams = n0(x.grams ?? x.g, 1, 5000), o: NutItem = { name, kcal: 0, protein: 0 }; if (grams) o.grams = Math.round(grams);
    const lab = x.label && typeof x.label === 'object' ? x.label : null, src = lab || (x.per100 && typeof x.per100 === 'object' ? x.per100 : null);
    if (!src || !grams) return o;
    const basis = lab ? String(lab.basis || '').toLowerCase().replace(/[^a-z0-9]/g, '') : '', sv = lab ? n0(lab.serving_g, 1, 2000, 1) : null;
    const k = !lab || basis === '100g' || basis === '100ml' ? 1 : basis === 'serving' ? 100 / (sv || grams) : 0;      // a serving with no size printed: the amount had is one serving
    if (!k) return o;
    const v = (a: unknown) => { const n = n0(a, 0, 1000, 2); return n == null ? 0 : n * k; };
    let p = v(src.protein ?? src.p), c = v(src.carbs ?? src.carbohydrate ?? src.c), f = v(src.fat ?? src.f), fib = v(src.fibre ?? src.fiber), alc = lab ? 0 : v(src.alcohol);
    const sum = p + c + f + fib + alc;
    if (sum > 100) { const d = 100 / sum; p *= d; c *= d; f *= d; fib *= d; alc *= d; }          // 100 g cannot hold more than 100 g
    const pr = lab ? n0(lab.kcal ?? lab.calories, 0, 5000, 1) : null, printed = pr != null && pr * k <= 905 ? pr * k : null;      // over 900 in 100 g is kJ read as kcal
    if (lab && printed == null && !(sum > 0)) return o;                                         // a label with nothing readable on it
    const k100 = printed != null ? printed : kcalOf(p, c, f, fib, alc), m = grams / 100;
    o.kcal = Math.round(k100 * m); o.protein = r1(p * m);
    const c1 = r1(c * m), f1 = r1(f * m), b1 = r1(fib * m), a1 = r1(alc * m);
    if (c1) o.carbs = c1; if (f1) o.fat = f1; if (b1) o.fibre = b1; if (a1) o.alcohol = a1;
    o.how = lab ? 'label' : 'nutrients';
    o.per100 = { kcal: Math.round(k100), protein: r1(p), carbs: r1(c), fat: r1(f), fibre: r1(fib) }; if (alc > 0) o.per100.alcohol = r1(alc);
    if (!lab) { const h = tidyHidden(x.hidden); if (h.length) o.hidden = h; }                     // v1.29: how it was made
    if (lab) {
      const pk = n0(lab.pack_g, 1, 5000, 1), l: Record<string, unknown> = { printed: printed != null, unit: basis === '100ml' ? 'ml' : 'g' };
      if (sv) l.serving_g = sv; if (pk) l.pack_g = pk; o.label = l;
    }
    return o;
  }).filter((x: NutItem | null): x is NutItem => !!x && x.kcal <= 5000).slice(0, 12);
  return ask > 0 ? { items, note: words(j.note, 200), questions: tidyQuestions(j.questions, ask) } : { items, note: words(j.note, 200) };
}
// a label, checked: numbers in sensible ranges or null, and a kind the app knows
export function tidyLabel(text: string, ask = 0): { label: Record<string, unknown> | null; note: string; questions?: Question[] } {
  const j = parse(text), l = j && typeof j.label === 'object' && j.label ? j.label : {};
  const kind = ['protein', 'creatine', 'other'].includes(String(l.kind)) ? String(l.kind) : 'other';
  const label: Record<string, unknown> = {
    brand: words(l.brand, 40), product: words(l.product ?? l.name, 60), kind, serving_label: words(l.serving_label ?? l.serving, 30),
    serving_g: g1(l.serving_g, 1000), kcal: g1(l.kcal, 2000), protein: g1(l.protein, 200), carbs: g1(l.carbs, 300), fat: g1(l.fat, 200),
    fibre: g1(l.fibre ?? l.fiber, 100), creatine_g: g1(l.creatine_g ?? l.creatine, 50), servings_per_pack: g1(l.servings_per_pack, 2000), net_g: g1(l.net_g, 20000),
  };
  if (label.kcal != null) label.kcal = Math.round(label.kcal as number);
  const any = label.brand || label.product || ['kcal', 'protein', 'creatine_g', 'serving_g'].some(k => label[k] != null);
  return ask > 0 ? { label: any ? label : null, note: words(j.note, 200), questions: tidyQuestions(j.questions, ask) } : { label: any ? label : null, note: words(j.note, 200) };
}

// v1.10: a vitamin or mineral label, checked: known keys only, amounts above 0 in mg, mcg, IU or g, one line per key
const SUPP_KEYS = ['va', 'bc', 'vd', 've', 'vk', 'vc', 'b1', 'b2', 'b3', 'b5', 'b6', 'b7', 'b9', 'b12', 'ca', 'fe', 'mg', 'zn', 'k', 'na', 'ph', 'se', 'cu', 'mn', 'io', 'o3', 'al'];
const FORMS = ['tablet', 'capsule', 'softgel', 'sachet', 'gummy', 'ml', 'drop', 'strip'];
type SuppItem = { key: string; name: string; amount: number; unit: string };
export function tidySupp(text: string, ask = 0): { supp: { brand: string; product: string; form: string; serving_label: string; items: SuppItem[] } | null; note: string; questions?: Question[] } {
  const j = parse(text), l = j && typeof j.supp === 'object' && j.supp ? j.supp : {};
  const items: SuppItem[] = [];
  for (const x of Array.isArray(l.items) ? l.items : []) {
    if (!x || typeof x !== 'object') continue;
    const key = String((x as any).key || '').trim().toLowerCase(), amount = Number((x as any).amount);
    let unit = String((x as any).unit || '').trim().toLowerCase().replace('µ', 'mc').replace(/^ug$/, 'mcg').replace(/^i\.?u\.?$/, 'iu');
    if (!SUPP_KEYS.includes(key) || !isFinite(amount) || amount <= 0 || amount > 1e7 || !['mg', 'mcg', 'iu', 'g'].includes(unit)) continue;
    unit = unit === 'iu' ? 'IU' : unit;
    const same = items.find(y => y.key === key);
    if (same) { if (same.unit === unit) same.amount = Math.round((same.amount + amount) * 1000) / 1000; continue; }      // EPA and DHA on two lines: added
    items.push({ key, name: words((x as any).name, 60), amount: Math.round(amount * 1000) / 1000, unit });
    if (items.length === 30) break;
  }
  const supp = { brand: words(l.brand, 40), product: words(l.product ?? l.name, 60), form: FORMS.includes(String(l.form)) ? String(l.form) : 'tablet', serving_label: words(l.serving_label ?? l.serving, 30), items };
  const any = items.length > 0 || !!supp.brand || !!supp.product;
  return ask > 0 ? { supp: any ? supp : null, note: words(j.note, 200), questions: tidyQuestions(j.questions, ask) } : { supp: any ? supp : null, note: words(j.note, 200) };
}

// v1.12: a web lookup's answer: the numbers for one serving in sensible ranges, or found: false with close matches
const BASIS = ['restaurant', 'delivery app', 'database', 'estimate'];
export function tidyWeb(text: string, sources: Src[] = []): Record<string, unknown> {
  const j = parse(text), kcal = g1(j.kcal ?? j.calories, 5000);
  const alts = (Array.isArray(j.alts) ? j.alts : []).map((a: unknown) => words(a, 80)).filter(Boolean).slice(0, 3);
  const found = (j.found === true || j.found === 'true') && kcal != null && kcal > 0 && !!words(j.name, 80);
  if (!found) return { found: false, alts, note: words(j.note, 200), sources };
  const est = (Array.isArray(j.estimated) ? j.estimated : []).map((x: unknown) => String(x).toLowerCase().replace('fiber', 'fibre').replace('carbohydrates', 'carbs'))
    .filter((x: string, i: number, a: string[]) => ['protein', 'carbs', 'fat', 'fibre'].includes(x) && a.indexOf(x) === i);
  const o: Record<string, unknown> = { found: true, name: words(j.name, 80), place: words(j.place, 60), serving: words(j.serving, 60), kcal: Math.round(kcal as number),
    protein: g1(j.protein ?? j.p, 500) ?? 0, carbs: g1(j.carbs ?? j.c, 1000) ?? 0, fat: g1(j.fat ?? j.f, 500) ?? 0,
    basis: BASIS.includes(String(j.basis || '').toLowerCase()) ? String(j.basis).toLowerCase() : 'database', estimated: est, note: words(j.note, 200), alts, sources };
  const fb = g1(j.fibre ?? j.fiber, 200); if (fb != null) o.fibre = fb;
  const gr = g1(j.grams, 3000); if (gr) o.grams = Math.round(gr);
  return o;
}

// v1.25: a menu from the web: names, and calories only where the menu showed them
const MBASIS = ['restaurant', 'delivery app', 'other site'];
export function tidyMenu(text: string, sources: Src[] = []): Record<string, unknown> {
  const j = parse(text), seen = new Set<string>(), groups: { name: string; items: Record<string, unknown>[] }[] = [];
  const alts = (Array.isArray(j.alts) ? j.alts : []).map((a: unknown) => words(a, 80)).filter(Boolean).slice(0, 3);
  let n = 0;
  for (const g of (Array.isArray(j.groups) ? j.groups : []).slice(0, 30)) {
    const items: Record<string, unknown>[] = [];
    for (const it of (g && Array.isArray(g.items) ? g.items : [])) {
      const name = words(typeof it === 'string' ? it : it && it.name, 80), k = name.toLowerCase();
      if (!name || seen.has(k) || n >= 120) continue;
      seen.add(k); n++;
      const o: Record<string, unknown> = { name }, kc = n0(it && it.kcal, 1, 5000), sv = words(it && it.serving, 60);
      if (kc != null) o.kcal = kc;
      if (sv) o.serving = sv;
      if (it && typeof it.veg === 'boolean') o.veg = it.veg;
      items.push(o);
    }
    if (items.length) groups.push({ name: words(g && g.name, 40) || 'Menu', items });
  }
  if (!(j.found === true || j.found === 'true') || !n) return { found: false, alts, note: words(j.note, 200), sources };
  const b = String(j.basis || '').toLowerCase();
  return { found: true, place: words(j.place, 60), as_of: words(j.as_of, 40), basis: MBASIS.includes(b) ? b : 'other site', more: j.more === true, groups, note: words(j.note, 200), alts, sources };
}
// v1.25: one item with its choices. Sizes carry the whole item's numbers; every other choice what it changes (minus allowed).
export function tidyOrder(text: string, sources: Src[] = []): Record<string, unknown> {
  const base = tidyWeb(text, sources);
  if (!base.found) return base;
  const j = parse(text), groups: Record<string, unknown>[] = [];
  let sized = false;
  for (const g of (Array.isArray(j.groups) ? j.groups : []).slice(0, 6)) {
    const name = words(g && g.name, 40), sizes = !sized && !!g && (g.sizes === true || /^sizes?$/i.test(name)), one = sizes || !(g && g.one === false);
    const options: Record<string, unknown>[] = [], seen = new Set<string>();
    for (const x of (g && Array.isArray(g.options) ? g.options : []).slice(0, 10)) {
      const on = words(x && x.name, 60), k = on.toLowerCase(), kc = n0(x && (x.kcal ?? x.calories), sizes ? 1 : -3000, 5000);
      if (!on || seen.has(k) || kc == null) continue;
      seen.add(k);
      const o: Record<string, unknown> = { name: on, kcal: kc, protein: n0(x.protein, sizes ? 0 : -300, 500, 1) ?? 0, carbs: n0(x.carbs, sizes ? 0 : -600, 1000, 1) ?? 0, fat: n0(x.fat, sizes ? 0 : -300, 500, 1) ?? 0 };
      const ml = n0(x.ml, 1, 3000), gr = n0(x.grams, 1, 3000);
      if (ml != null) o.ml = ml; else if (gr != null) o.grams = gr;
      if (x.scales === true && !sizes) o.scales = true;
      if (x.est === true) o.est = true;
      if (x.usual === true) o.usual = true;
      if (x.sel === true) o.sel = true;
      options.push(o);
    }
    if (!name || options.length < (sizes ? 2 : 1)) continue;
    if (one) {
      // exactly one usual choice: the marked one, else the size closest to the item's own calories or the choice that changes nothing, else the first
      let u = options.findIndex(o => o.usual === true);
      if (u < 0) u = sizes ? options.reduce((best, o, i) => (Math.abs((o.kcal as number) - (base.kcal as number)) < Math.abs((options[best].kcal as number) - (base.kcal as number)) ? i : best), 0) : Math.max(0, options.findIndex(o => !o.kcal && !o.protein && !o.carbs && !o.fat));
      options.forEach((o, i) => { if (i === u) o.usual = true; else delete o.usual; });
      const s = options.findIndex(o => o.sel === true);
      options.forEach((o, i) => { if (i !== s) delete o.sel; });
    } else options.forEach(o => { delete o.usual; });
    if (sizes) sized = true;
    groups.push(sizes ? { name, one, sizes: true, options } : { name, one, options });
  }
  return Object.assign(base, { build: words(j.build, 80), groups });
}
// v1.28: an order's items with their numbers; a pack's table per 100 g; a program's days
const BASES = ['restaurant', 'delivery app', 'other site', 'estimate'];
export function tidyShot(text: string, sources: Src[] = []): Record<string, unknown> {
  const j = parse(text), items: Record<string, unknown>[] = [];
  for (const x of (Array.isArray(j.items) ? j.items : []).slice(0, 15)) {
    const name = words(x && x.name, 60); if (!name) continue;
    const o: Record<string, unknown> = { name, qty: Math.max(1, Math.min(20, Math.round(Number(x.qty ?? x.quantity) || 1))) };
    const b = words(x.build, 80); if (b) o.build = b;
    const kc = n0(x.kcal ?? x.calories, 0, 5000);
    if (kc != null) {
      o.kcal = Math.round(kc); o.protein = n0(x.protein, 0, 500, 1) ?? 0; o.carbs = n0(x.carbs, 0, 1000, 1) ?? 0; o.fat = n0(x.fat, 0, 500, 1) ?? 0;
      const g = n0(x.grams ?? x.ml, 1, 3000); if (g != null) o.grams = Math.round(g);
      o.est = x.est === true; o.basis = BASES.includes(String(x.basis)) ? String(x.basis) : (x.est === true ? 'estimate' : 'other site');
    }
    items.push(o);
  }
  const found = j.found !== false && items.length > 0;
  return found ? { found, place: words(j.place, 60), app: words(j.app, 30), items, note: words(j.note, 200), sources } : { found: false, note: words(j.note, 200), sources: [] };
}
export function tidyPack(text: string): { pack: Record<string, unknown> | null; note: string } {
  const j = parse(text), l = j && typeof j.pack === 'object' && j.pack ? j.pack : {};
  const basis = String(l.basis || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^per/, ''), sv = n0(l.serving_g, 1, 2000, 1);
  const k = basis === '100g' || basis === '100ml' ? 1 : basis === 'serving' && sv ? 100 / sv : 0;
  const v = (a: unknown, max: number) => { const n = n0(a, 0, max, 2); return n == null || !k ? null : Math.round(n * k * 10) / 10; };
  let kcal = v(l.kcal, 5000); if (kcal != null && kcal > 905) kcal = Math.round(kcal / 4.184);         // kJ read as kcal
  const sodium = v(l.sodium_mg, 50000), salt = v(l.salt_g, 100);
  const per: Record<string, number | null> = { kcal: kcal == null ? null : Math.round(kcal), protein: v(l.protein, 1000), carbs: v(l.carbs, 1000), sugars: v(l.sugars ?? l.sugar, 1000), added_sugars: v(l.added_sugars, 1000),
    fat: v(l.fat, 1000), sat_fat: v(l.sat_fat ?? l.saturated_fat, 1000), fibre: v(l.fibre ?? l.fiber, 1000),
    salt_g: salt != null ? salt : sodium != null ? Math.round(sodium * 2.5 / 100) / 10 : null };      // salt = sodium × 2.5
  const any = ['kcal', 'protein', 'carbs', 'fat'].some(x => per[x] != null);
  const pack = any ? { brand: words(l.brand, 40), product: words(l.product ?? l.name, 60), unit: basis === '100ml' ? 'ml' : 'g', per100: per, net: n0(l.net_g, 1, 20000), mrp: n0(l.mrp, 1, 100000) } : null;
  return { pack, note: words(j.note, 200) };
}
export function tidyProgram(text: string): { program: Record<string, unknown> | null; note: string } {
  const j = parse(text);
  if (j.is_program === false) return { program: null, note: words(j.note, 200) };
  const days: Record<string, unknown>[] = [];
  for (const d of (Array.isArray(j.days) ? j.days : []).slice(0, 7)) {
    const items: Record<string, unknown>[] = [];
    for (const x of (d && Array.isArray(d.items) ? d.items : []).slice(0, 15)) {
      const name = words(x && x.name, 60); if (!name) continue;
      const o: Record<string, unknown> = { name, sets: Math.max(1, Math.min(10, Math.round(Number(x.sets) || 3))) };
      const secs = n0(x.secs ?? x.seconds, 5, 3600), r = n0(x.reps, 1, 100), hi = n0(x.reps_hi, 2, 100);
      if (secs != null && r == null) o.secs = Math.round(secs); else { o.reps = Math.round(r ?? 10); if (hi != null && hi > (o.reps as number)) o.reps_hi = Math.round(hi); }
      const note = words(x.note, 60); if (note) o.note = note;
      items.push(o);
    }
    if (items.length) days.push({ name: words(d.name, 40) || 'Day ' + (days.length + 1), items });
  }
  return { program: days.length ? { name: words(j.name, 60), days } : null, note: words(j.note, 200) };
}
// v1.25: a recipe's ingredients in grams, and what can be seen in a fridge with dishes to make. Never a calorie.
export function tidyRecipe(text: string): { recipe: Record<string, unknown> | null; note: string } {
  const j = parse(text), note = words(j.note, 200), items: { name: string; grams: number }[] = [];
  if (j.is_recipe === false || j.is_recipe === 'false') return { recipe: null, note };
  for (const x of (Array.isArray(j.items) ? j.items : []).slice(0, 40)) {
    const name = words(x && x.name, 60), g = n0(x && (x.grams ?? x.g ?? x.ml), 0.5, 20000, 1);
    if (name && g != null) items.push({ name, grams: g });
  }
  if (!items.length) return { recipe: null, note };
  const sv = n0(j.serves, 1, 100);
  return { recipe: { name: words(j.name, 60) || 'Recipe', serves: sv ?? 1, serves_guess: sv == null || j.serves_guess === true, items }, note };
}
export function tidyFridge(text: string): { food: boolean; seen: string[]; dishes: Record<string, unknown>[]; note: string } {
  const j = parse(text), list = (v: unknown, n: number, len: number): string[] => (Array.isArray(v) ? v : []).map((x: unknown) => words(x, len)).filter(Boolean).slice(0, n);
  const seen = list(j.seen, 30, 40), dishes: Record<string, unknown>[] = [];
  for (const d of (Array.isArray(j.dishes) ? j.dishes : []).slice(0, 6)) {
    const name = words(d && d.name, 60);
    const items = (d && Array.isArray(d.items) ? d.items : []).slice(0, 8).map((x: any) => ({ name: words(x && x.name, 60), grams: n0(x && (x.grams ?? x.g), 1, 2000) })).filter((x: any) => x.name && x.grams != null);
    if (!name || !items.length) continue;
    const o: Record<string, unknown> = { name, uses: list(d.uses, 8, 40), items, how: list(d.how, 5, 120) }, m = n0(d.mins, 1, 600);
    if (m != null) o.mins = m;
    dishes.push(o);
  }
  return { food: j.is_food !== false && j.is_food !== 'false' && dishes.length > 0, seen, dishes, note: words(j.note, 200) };
}
// several lines of typed text (a pasted recipe): each line tidied, the line breaks kept
const textLines = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\r/g, '').split('\n').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n').slice(0, n) : '');

// v1.12: what was read from workout screenshots, every number in a sensible range or null
const n0 = (v: unknown, lo: number, hi: number, dp = 0): number | null => { const n = Number(v); if (v == null || v === '' || !isFinite(n) || n < lo || n > hi) return null; const k = 10 ** dp; return Math.round(n * k) / k; };
export function tidyWorkout(text: string): { workout: Record<string, unknown> | null; note: string } {
  const j = parse(text);
  const zones = (Array.isArray(j.zones) ? j.zones : []).map((z: any) => ({ name: words(z && (z.name ?? z.zone), 40), min: n0(z && (z.min ?? z.minutes), 0, 600, 1), low: n0(z && z.low, 30, 240), high: n0(z && z.high, 30, 240) }))
    .filter((z: any) => z.name && z.min != null).slice(0, 7);
  const other = (Array.isArray(j.other) ? j.other : []).map((o: any) => ({ name: words(o && o.name, 40), value: words(o && o.value != null ? String(o.value) : '', 40) })).filter((o: any) => o.name && o.value).slice(0, 8);
  const kind = String(j.kcal_kind || '').toLowerCase();
  const w: Record<string, unknown> = { app: words(j.app, 40), kcal: n0(j.kcal ?? j.calories, 1, 5000), kcal_kind: kind === 'active' || kind === 'total' ? kind : '',
    avg_hr: n0(j.avg_hr, 30, 230), max_hr: n0(j.max_hr, 30, 240), min_hr: n0(j.min_hr, 25, 230), duration_min: n0(j.duration_min, 1, 600, 1),
    zones, steps: n0(j.steps, 1, 100000), distance_km: n0(j.distance_km, 0.01, 100, 2), other };
  if (w.max_hr != null && w.avg_hr != null && (w.max_hr as number) < (w.avg_hr as number)) w.max_hr = null;
  if (w.min_hr != null && w.avg_hr != null && (w.min_hr as number) > (w.avg_hr as number)) w.min_hr = null;
  const any = ['kcal', 'avg_hr', 'max_hr', 'duration_min', 'steps', 'distance_km'].some(k => w[k] != null) || zones.length || other.length;
  return { workout: any ? w : null, note: words(j.note, 200) };
}

// v1.13: what was read from a whole day's activity summary, every number in a sensible range or null
export function tidyLeft(text: string, n: number): { left: { i: number; g: number | null; share: number | null }[]; note: string } {
  const j = parse(text), seen = new Set<number>();
  const left = (Array.isArray(j.left) ? j.left : []).map((x: any) => ({ i: Math.round(Number(x && x.i)), g: n0(x && x.g, 0, 3000), share: n0(x && x.share, 0, 1, 2) }))
    .filter((x: any) => x.i >= 1 && x.i <= n && (x.g != null || x.share != null) && !seen.has(x.i) && seen.add(x.i));
  return { left, note: words(j.note, 200) };
}
export function tidyDay(text: string): { day: Record<string, unknown> | null; shows: string; note: string } {
  const j = parse(text);
  const zones = (Array.isArray(j.zones) ? j.zones : []).map((z: any) => ({ name: words(z && (z.name ?? z.zone), 40), min: n0(z && (z.min ?? z.minutes), 0, 1440, 1), low: n0(z && z.low, 30, 240), high: n0(z && z.high, 30, 240) }))
    .filter((z: any) => z.name && z.min != null).slice(0, 7);
  const other = (Array.isArray(j.other) ? j.other : []).map((o: any) => ({ name: words(o && o.name, 40), value: words(o && o.value != null ? String(o.value) : '', 40) })).filter((o: any) => o.name && o.value).slice(0, 8);
  const date = /^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(j.date || '')) ? String(j.date) : null;
  const d: Record<string, unknown> = { app: words(j.app, 40), date, date_text: words(j.date_text, 40), steps: n0(j.steps, 1, 100000), distance_km: n0(j.distance_km, 0.01, 150, 2),
    kcal_total: n0(j.kcal_total, 300, 9000), kcal_active: n0(j.kcal_active, 1, 6000), active_min: n0(j.active_min, 1, 1440), floors: n0(j.floors, 1, 500),
    hr_rest: n0(j.hr_rest, 25, 150), hr_avg: n0(j.hr_avg, 30, 220), hr_max: n0(j.hr_max, 40, 240), hr_min: n0(j.hr_min, 25, 220), zones, sleep_min: n0(j.sleep_min, 30, 1440),
    sleep_score: n0(j.sleep_score, 1, 100), deep_min: n0(j.deep_min, 1, 720), rem_min: n0(j.rem_min, 1, 720), hrv_ms: n0(j.hrv_ms, 5, 300), other };
  if (d.kcal_total != null && d.kcal_active != null && (d.kcal_total as number) < (d.kcal_active as number)) d.kcal_total = null;
  if (d.hr_max != null && d.hr_avg != null && (d.hr_max as number) < (d.hr_avg as number)) d.hr_max = null;
  if (d.hr_min != null && d.hr_avg != null && (d.hr_min as number) > (d.hr_avg as number)) d.hr_min = null;
  if (d.sleep_min != null && ((d.deep_min as number) || 0) + ((d.rem_min as number) || 0) > (d.sleep_min as number)) { d.deep_min = null; d.rem_min = null; }      // parts bigger than the whole: misread
  const any = ['steps', 'kcal_total', 'kcal_active', 'active_min', 'hr_rest', 'hr_avg', 'hr_max', 'sleep_min', 'distance_km', 'sleep_score', 'hrv_ms'].some(k => d[k] != null) || zones.length || other.length;
  return { day: any ? d : null, shows: String(j.shows || '').toLowerCase() === 'workout' ? 'workout' : 'day', note: words(j.note, 200) };
}

// 1.35.2 (60): a night in the words the app (from 1.21.11) reads in "other", each once and first: "Bedtime" and "Wake-up time" as clock
// times, "SpO2" and "Breathing rate" as numbers, "Light sleep (core)" for Apple's core sleep; the heart rate while asleep as the
// resting heart rate when no resting one was given (one number, never a range). Items that would make the app read them again
// differently (a bedtime that is no time, a range under "time in bed") are left out. Then tidied as a day.
const clockOf = (v: unknown): string | null => {
  const m = /^\s*(\d{1,2})[:.](\d\d)\s*(?:([ap])\.?\s*m\.?)?\s*$/i.exec(String(v ?? '')); if (!m) return null;
  const h = +m[1], ap = (m[3] || '').toLowerCase(); if (+m[2] > 59) return null;
  if (ap) return h >= 1 && h <= 12 ? `${h}:${m[2]} ${ap === 'a' ? 'AM' : 'PM'}` : null;
  return h <= 23 ? `${String(h).padStart(2, '0')}:${m[2]}` : null;
};
export function rangeOf(v: unknown): [string, string] | null {
  const m = /(\d{1,2})[:.](\d\d)\s*(?:([ap])\.?\s*m\.?)?\s*(?:–|—|-|to)\s*(\d{1,2})[:.](\d\d)\s*(?:([ap])\.?\s*m\.?)?/i.exec(String(v ?? '')); if (!m) return null;
  const h1 = +m[1], h2 = +m[4]; let a1 = (m[3] || '').toLowerCase(), a2 = (m[6] || '').toLowerCase();
  if (!a1 && a2) a1 = a2 === 'a' && h1 % 12 > h2 % 12 ? 'p' : a2;                  // "11:30 – 7:10 AM": the start is the night before
  if (a1 && !a2) a2 = a1 === 'p' && h2 % 12 < h1 % 12 ? 'a' : a1;
  const s = clockOf(`${h1}:${m[2]}${a1 ? ' ' + a1 + 'm' : ''}`), e = clockOf(`${h2}:${m[5]}${a2 ? ' ' + a2 + 'm' : ''}`);
  return s && e ? [s, e] : null;
}
export function tidySleep(text: string): { day: Record<string, unknown> | null; shows: string; note: string } {
  const j: any = parse(text) || {};
  const all = (Array.isArray(j.other) ? j.other : []).map((o: any) => ({ name: words(o && o.name, 40), value: words(o && o.value != null ? String(o.value) : '', 40) })).filter((o: any) => o.name && o.value);
  const BED = /bed ?time|went to bed|fell asleep|sleep start|sleep onset|asleep at|in bed at/, WAKE = /woke|wake ?up|wake-up|wakeup|wake time|sleep end|got up/;
  const O2 = /spo2|oxygen|o2 sat/, BR = /breath|respirat/, SPAN = /time in bed|sleep time|sleep window/, HR = /heart ?rate|^hr\b|pulse/;
  const num1 = (v: string, lo: number, hi: number, dp: number) => { if (/\d\s*[–—-]\s*\d/.test(v)) return null; const m = /(\d+(?:\.\d+)?)/.exec(v); return m ? n0(m[1], lo, hi, dp) : null; };
  let bed = clockOf(j.bed_time), wake = clockOf(j.wake_time);
  for (const o of all) { const n = o.name.toLowerCase(); if (!bed && BED.test(n)) bed = clockOf(o.value); if (!wake && WAKE.test(n)) wake = clockOf(o.value); }
  if (!bed || !wake) for (const x of [j.sleep_window, j.time_in_bed, ...all.map((o: any) => o.value)]) { const r = rangeOf(x); if (r) { bed = bed || r[0]; wake = wake || r[1]; break; } }
  let o2 = n0(j.spo2, 70, 100, 1), br = n0(j.breath_rate, 5, 40, 1), hrs: number | null = null;
  for (const o of all) {
    const n = o.name.toLowerCase();
    if (o2 == null && O2.test(n)) o2 = num1(o.value, 70, 100, 1);
    else if (br == null && BR.test(n)) br = num1(o.value, 5, 40, 1);
    else if (hrs == null && HR.test(n) && !/max|high|peak|range|walking|workout|variab/.test(n)) hrs = num1(o.value, 25, 150, 0);
  }
  const keep = all.filter((o: any) => { const n = o.name.toLowerCase(); return !(BED.test(n) || WAKE.test(n) || O2.test(n) || BR.test(n) || (SPAN.test(n) && /[–—-]|\bto\b/.test(o.value)) || ((bed || wake) && rangeOf(o.value))); })
    .map((o: any) => (/^core\b|core sleep/i.test(o.name) ? { name: 'Light sleep (core)', value: o.value } : o));
  const first = [bed ? { name: 'Bedtime', value: bed } : null, wake ? { name: 'Wake-up time', value: wake } : null, o2 != null ? { name: 'SpO2', value: o2 + '%' } : null, br != null ? { name: 'Breathing rate', value: br + ' brpm' } : null].filter(Boolean);
  j.other = [...first, ...keep];
  if (n0(j.hr_rest, 25, 150) == null && hrs != null) j.hr_rest = hrs;
  return tidyDay(JSON.stringify(j));
}

// v1.20: the machine photo
export const MACHINE_HEAD = (n: number, list: string) => `You are looking at ${n > 1 ? n + ' photos' : 'a photo'} taken in a gym, of a machine, bench, rack or other piece of equipment, for a workout app.
Say what the equipment is (for example "Lat pulldown machine", "Smith machine", "Cable crossover station", "Leg press", "Pec deck"), or say that the photo doesn't show gym equipment.
From the person's exercise library below (one per line, id|name), pick up to 6 exercises that are done on this equipment, the most typical first, and give their exact ids. Then name up to 3 other common exercises done on it that are not in the library.
Give up to 4 short setup tips for this kind of equipment (seat height, pads, grip, range of motion), one plain sentence each.
Library:
${list || '(empty)'}`;
export const MACHINE_SHAPE = `{"is_gym":true,"machine":"Lat pulldown machine","ids":["lat-pulldown"],"other":["Straight-arm pulldown"],"setup":["Set the thigh pad so your knees are locked under it."],"note":"one short sentence on anything hard to see, or an empty string"}`;
export function tidyMachine(text: string, ids: Set<string>): { machine: { name: string; ids: string[]; other: string[]; setup: string[] } | null; note: string } {
  const j = parse(text), name = words(j.machine, 60);
  const pick: string[] = [];
  for (const x of Array.isArray(j.ids) ? j.ids : []) { const id = String(x || '').trim(); if (ids.has(id) && !pick.includes(id)) pick.push(id); if (pick.length >= 6) break; }
  const list = (v: unknown, n: number, len: number) => (Array.isArray(v) ? v : []).map((t: unknown) => words(t, len)).filter(Boolean).slice(0, n);
  const ok = j.is_gym !== false && !!name;
  return { machine: ok ? { name, ids: pick, other: list(j.other, 3, 60), setup: list(j.setup, 4, 160) } : null, note: words(j.note, 200) };
}

export async function handler(req: Request, env: (k: string) => string | undefined, f: Fetch): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return say(405, 'Send the photo with POST.', 'method');
  const auth = req.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+/i.test(auth)) return say(401, 'Sign in first.', 'signed_out');
  let body: any;
  try { body = await req.json(); } catch (_e) { return say(400, 'The photo did not arrive properly. Try again.', 'bad_request'); }
  const web = !!body && body.kind === 'web', q = web ? words(body.q, 120) : '', where = web ? words(body.where, 60) : '';
  if (web && q.length < 2) return say(400, 'Type the dish to look up.', 'bad_request');
  const machine = !!body && body.kind === 'machine';
  // v1.25: a restaurant's menu, one item with its choices, a recipe (photos or pasted text), what is in the fridge
  const menu = !!body && body.kind === 'menu', order = !!body && body.kind === 'order', recipe = !!body && body.kind === 'recipe', fridge = !!body && body.kind === 'fridge';
  const place = menu || order ? words(body.place, 60) : '', oq = order ? words(body.q, 160) : '', rtext = recipe ? textLines(body.text, 6000) : '';
  // v1.28: an order screenshot, a packet to compare, a workout program, a recipe from a link
  const shot = !!body && body.kind === 'shot', pack = !!body && body.kind === 'pack', program = !!body && body.kind === 'program';
  const ptext = program ? textLines(body.text, 6000) : '', rurl0 = recipe ? String(body.url || '').trim() : '', rurl = /^https?:\/\/[^\s"<>]{4,500}$/i.test(rurl0) ? rurl0 : '';
  if (recipe && rurl0 && !rurl) return say(400, 'That link does not look right. Copy the whole link and paste it again.', 'bad_request');
  const sent = !!body && (!!body.image || (Array.isArray(body.images) && body.images.length > 0));
  if (program && !sent && ptext.length < 20) return say(400, 'Paste the program, or take a photo of it.', 'bad_request');
  if (menu && place.length < 2) return say(400, 'Type the name of the place.', 'bad_request');
  if (order && oq.length < 2) return say(400, 'Type what you ordered.', 'bad_request');
  if (recipe && !sent && !rurl && rtext.length < 20) return say(400, 'Paste the recipe, or take a photo of it.', 'bad_request');
  const noImg = web || menu || order || (recipe && !sent) || (program && !sent);
  const imgs: Img[] = [];
  if (!noImg) {
    // 1.35.2 (60): watch screenshots (a workout, a day, a night) up to 10 read together; photos of food, packets and the rest up to 4
    const many = !!body && (body.kind === 'workout' || body.kind === 'day' || body.kind === 'sleep');
    const raw: unknown[] = body && Array.isArray(body.images) && body.images.length ? body.images.slice(0, many ? 10 : 4) : [body && body.image];
    for (const r of raw) {
      let img = String(r || ''), mime = 'image/jpeg';
      const m = /^data:(image\/(?:jpeg|png|webp));base64,/.exec(img);
      if (m) { mime = m[1]; img = img.slice(m[0].length); }
      if (img.length < 200) return say(400, 'No photo was sent.', 'bad_request');
      if (img.length > 2000000) return say(413, 'That photo is too big to read. Try again with the app up to date.', 'too_big');
      if (!/^[A-Za-z0-9+/=]+$/.test(img)) return say(400, 'The photo did not arrive properly. Try again.', 'bad_request');
      imgs.push({ data: img, mime });
    }
    if (imgs.reduce((a, x) => a + x.data.length, 0) > 6000000) return say(413, 'Those photos are too big together. Try fewer photos.', 'too_big');
  }
  const leftOver = !!body && body.kind === 'left';
  const lines: { name: string; g: number | null }[] = leftOver && Array.isArray(body.lines) ? body.lines.slice(0, 12).map((x: any) => ({ name: words(x && x.name, 60), g: n0(x && x.g, 1, 3000) })).filter((x: any) => x.name) : [];
  if (leftOver && !lines.length) return say(400, 'Say what the meal was.', 'bad_request');
  const workout = !!body && body.kind === 'workout', sleep = !!body && body.kind === 'sleep', day = !!body && (body.kind === 'day' || sleep), ctx = workout || day ? words(body.ctx, 160) : '';
  const kind: Kind = body && body.kind === 'label' ? 'label' : body && body.kind === 'supp' ? 'supp' : 'meal';
  const isLabel = kind !== 'meal', typeIt = isLabel ? 'Type what the label says.' : 'Type the calories for this one.';
  const answers = tidyAnswers(body && body.answers), ask = answers.length ? 0 : Math.max(0, Math.min(5, Math.floor(Number(body && body.ask) || 0)));

  const keys: Record<string, string | undefined> = { gemini: env('GEMINI_API_KEY'), claude: env('ANTHROPIC_API_KEY'), openai: env('OPENAI_API_KEY') };
  let which = String(env('GD_AI_PROVIDER') || '').trim().toLowerCase();
  which = which === 'anthropic' ? 'claude' : which === 'google' ? 'gemini' : which === 'chatgpt' ? 'openai' : which;
  if (!keys[which]) which = keys.gemini ? 'gemini' : keys.claude ? 'claude' : keys.openai ? 'openai' : '';
  if (!which) return say(503, web || menu || order ? "Looking dishes up isn't set up yet: the server has no AI key. Take a photo of it, or type the calories." : workout || day ? "Reading screenshots isn't set up yet: the server has no AI key. Type the calories for now." : `Reading photos isn't set up yet: the server has no AI key. ${isLabel ? 'Type what the label says' : 'Type the calories'} for now.`, 'no_key');
  if ((web || menu || order || shot || rurl) && which === 'openai') return say(503, "Looking dishes up on the web needs a Gemini or Claude key on the server. Take a photo of it instead.", 'no_web');

  // Count this read against the person. The database checks the sign-in, so a made-up one stops here.
  const base = String(env('SUPABASE_URL') || '').replace(/\/+$/, ''), apikey = req.headers.get('apikey') || env('SUPABASE_ANON_KEY') || '';
  let ok: Response;
  try { ok = await f(base + '/rest/v1/rpc/gd_ai_use', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey, Authorization: auth }, body: '{}' }); }
  catch (_e) { return say(502, "The server couldn't check your account just now. Try again in a moment.", 'check_failed'); }
  if (!ok.ok) {
    let j: any = {}; try { j = await ok.json(); } catch (_e) { j = {}; }
    if (ok.status === 401 || j.code === '28000') return say(401, 'Sign in again, then try once more.', 'signed_out');
    if (j.code === 'P0001' && j.message) return say(429, String(j.message), 'limit');
    if (j.code === 'PGRST202' || ok.status === 404) return say(503, 'The server needs its v1.7 update before it can read photos.', 'old_server');
    return say(502, "The server couldn't check your account just now. Try again in a moment.", 'check_failed', 'rpc ' + ok.status);
  }

  const fixed = String(env('GD_AI_MODEL') || '').trim(), model = fixed || MODELS[which], key = keys[which] as string;
  const ask1 = (prompt: string) => (which === 'gemini' ? gemini(f, key, model, !!fixed, imgs, prompt) : which === 'claude' ? claude(f, key, model, imgs, prompt) : openai(f, key, model, !!fixed, imgs, prompt));
  if (machine) {
    const list: string[] = (Array.isArray(body.list) ? body.list.slice(0, 250) : []).map((x: unknown) => words(x, 80)).filter((x: string) => /^[\w-]+\|./.test(x));
    try {
      const out = tidyMachine(await ask1(MACHINE_HEAD(imgs.length, list.join('\n')) + REPLY + MACHINE_SHAPE), new Set(list.map(x => x.split('|')[0])));
      if (!out.machine) return say(422, "No gym machine could be made out in that photo. Try a photo of the whole machine.", 'no_machine');
      return json(200, { machine: out.machine, note: out.note, by: which });
    } catch (e) {
      const st = e instanceof Upstream ? e.status : 0, d = which + ' machine ' + (st || 'error');
      console.error(`gd-meal-photo: machine read gave up (${d})`);
      if (st === 402) return say(503, SPENT + 'Find the exercise in your list for now.', 'no_credit', d);
      if (st === 429) return say(503, "The AI service is busy, or today's free allowance is used up. Try again later.", 'ai_busy', d);
      if (st === 401 || st === 403) return say(503, 'The AI key on the server was refused. It may be mistyped or switched off.', 'bad_key', d);
      if (st === 404) return say(503, 'The AI model set on the server was not found. It may have been retired.', 'no_model', d);
      if (st === 400) return say(422, "The AI service couldn't use that photo.", 'ai_refused', d);
      return say(502, "The photo couldn't be read just now. Try again.", 'ai_failed', d);
    }
  }
  // v1.25: one way of saying what went wrong for the four new kinds
  const failed = (e: unknown, what: string, next: string, webby: boolean) => {
    const st = e instanceof Upstream ? e.status : 0, d = which + ' ' + what + ' ' + (st || 'error');
    console.error(`gd-meal-photo: ${what} gave up (${d})`);
    if (st === 402) return say(503, SPENT + next, 'no_credit', d);
    if (st === 429) return say(503, webby ? 'The web search is busy just now. Try again in a minute.' : "The AI service is busy, or today's free allowance is used up. Try again later.", 'ai_busy', d);
    if (st === 401 || st === 403) return say(503, webby ? "The server's AI key can't search the web." : 'The AI key on the server was refused. It may be mistyped or switched off.', webby ? 'no_web' : 'bad_key', d);
    if (st === 404) return say(503, 'The AI model set on the server was not found. It may have been retired.', 'no_model', d);
    if (st === 400) return webby ? say(503, "Searching the web isn't available with the server's AI key.", 'no_web', d) : say(422, "The AI service couldn't use that.", 'ai_refused', d);
    return say(502, webby ? "The web search didn't answer just now. Try again." : "That couldn't be read just now. Try again.", 'ai_failed', d);
  };
  if (menu || order) {
    try {
      const prompt = menu ? MENU_HEAD(place, words(body.where, 60)) + REPLY + MENU_SHAPE : ORDER_HEAD(oq, place) + REPLY + ORDER_SHAPE;
      const r = which === 'gemini' ? await geminiWeb(f, key, String(env('GD_WEB_MODEL') || '').trim() || WEB_MODEL, prompt)
        : await claudeWeb(f, key, model, prompt, menu ? { uses: 5, tokens: 8000, fetch: 2, ms: LIMITS.menu } : { uses: 4, tokens: 4000, fetch: 1 });
      return json(200, Object.assign(menu ? tidyMenu(r.text, r.sources) : tidyOrder(r.text, r.sources), { by: which }));
    } catch (e) { return failed(e, menu ? 'menu' : 'order', menu ? 'Type the dish for now.' : 'Type the calories for now.', true); }
  }
  if (shot) {
    try {
      const prompt = SHOT_HEAD(imgs.length) + REPLY + SHOT_SHAPE;
      const r = which === 'gemini' ? await geminiWeb(f, key, String(env('GD_WEB_MODEL') || '').trim() || WEB_MODEL, prompt, imgs)
        : await claudeWeb(f, key, model, prompt, { uses: 6, tokens: 6000, fetch: 1, ms: LIMITS.menu, imgs });
      const out = tidyShot(r.text, r.sources);
      if (!out.found) return say(422, "No food order could be read in that screenshot. Try a screenshot of the order's list of items.", 'no_order');
      return json(200, Object.assign(out, { by: which }));
    } catch (e) { return failed(e, 'shot', 'Add the items by hand for now.', true); }
  }
  if (pack) {
    try {
      const out = tidyPack(await ask1(PACK_HEAD(imgs.length) + REPLY + PACK_SHAPE));
      if (!out.pack) return say(422, 'No nutrition table could be read in that photo. Try a sharper photo of the table on the back.', 'no_label');
      return json(200, { pack: out.pack, note: out.note, by: which });
    } catch (e) { return failed(e, 'pack', 'Try again with a sharper photo.', false); }
  }
  if (program) {
    try {
      const out = tidyProgram(await ask1(PROGRAM_HEAD(imgs.length, ptext) + REPLY + PROGRAM_SHAPE));
      if (!out.program) return say(422, 'No workout could be read from that. Try a clearer photo, or paste it as text.', 'no_program');
      return json(200, { program: out.program, note: out.note, by: which });
    } catch (e) { return failed(e, 'program', 'Make the days by hand for now.', false); }
  }
  if (recipe && rurl) {
    try {
      const prompt = RECIPE_URL_HEAD(rurl) + REPLY + RECIPE_SHAPE;
      const r = which === 'gemini' ? await geminiWeb(f, key, String(env('GD_WEB_MODEL') || '').trim() || WEB_MODEL, prompt) : await claudeWeb(f, key, model, prompt, { uses: 1, fetch: 2, tokens: 3000 });
      const out = tidyRecipe(r.text);
      if (!out.recipe) return say(422, (out.note ? out.note + ' ' : '') + "Some sites (Instagram, for one) don't open for GymDay: copy the recipe's text and paste it instead.", 'no_recipe');
      return json(200, { recipe: out.recipe, note: out.note, by: which, sources: r.sources });
    } catch (e) { return failed(e, 'recipe link', 'Paste the recipe as text for now.', true); }
  }
  if (recipe) {
    try {
      const out = tidyRecipe(await ask1(RECIPE_HEAD(imgs.length, rtext) + REPLY + RECIPE_SHAPE));
      if (!out.recipe) return say(422, 'No recipe could be read from that. Try a clearer photo, or paste the recipe as text.', 'no_recipe');
      return json(200, { recipe: out.recipe, note: out.note, by: which });
    } catch (e) { return failed(e, 'recipe', 'Add the ingredients by hand for now.', false); }
  }
  if (fridge) {
    try {
      const out = tidyFridge(await ask1(FRIDGE_HEAD(imgs.length, words(body.ctx, 160)) + REPLY + FRIDGE_SHAPE));
      if (!out.food) return say(422, 'No food could be made out in that photo. Try a closer photo with the light on.', 'no_food');
      return json(200, { seen: out.seen, dishes: out.dishes, note: out.note, by: which });
    } catch (e) { return failed(e, 'fridge', 'Search your foods for now.', false); }
  }
  if (web) {
    try {
      const prompt = WEB_HEAD(q, where) + REPLY + WEB_SHAPE;
      const r = which === 'gemini' ? await geminiWeb(f, key, String(env('GD_WEB_MODEL') || '').trim() || WEB_MODEL, prompt) : await claudeWeb(f, key, model, prompt);
      return json(200, Object.assign(tidyWeb(r.text, r.sources), { by: which }));
    } catch (e) {
      const st = e instanceof Upstream ? e.status : 0, d = which + ' web ' + (st || 'error');
      console.error(`gd-meal-photo: web lookup gave up (${d})`);
      if (st === 402) return say(503, SPENT + 'Type the calories for now.', 'no_credit', d);
      if (st === 429) return say(503, "The web search is busy, or today's free searches are used up. Take a photo of it instead.", 'ai_busy', d);
      if (st === 401 || st === 403) return say(503, "The server's AI key can't search the web. Take a photo of it instead.", 'no_web', d);
      if (st === 400 || st === 404) return say(503, "Searching the web isn't available with the server's AI key. Take a photo of it instead.", 'no_web', d);
      return say(502, "The web search didn't answer just now. Try again, or take a photo of it.", 'ai_failed', d);
    }
  }
  if (leftOver) {
    const nb = Math.max(0, Math.min(imgs.length - 1, Math.round(Number(body.before) || 0))), na = imgs.length - nb;
    try {
      const prompt = LEFT_HEAD(nb, na, lines) + REPLY + LEFT_SHAPE;
      const text = which === 'gemini' ? await gemini(f, key, model, !!fixed, imgs, prompt) : which === 'claude' ? await claude(f, key, model, imgs, prompt) : await openai(f, key, model, !!fixed, imgs, prompt);
      const out = tidyLeft(text, lines.length);
      if (!out.left.length) return say(422, "What's left on the plate couldn't be read. Type the grams instead.", 'no_data');
      return json(200, { left: out.left, note: out.note, by: which });
    } catch (e) {
      const st = e instanceof Upstream ? e.status : 0, d = which + ' left ' + (st || 'error');
      console.error(`gd-meal-photo: leftovers read gave up (${d})`);
      if (st === 402) return say(503, SPENT + 'Type the grams instead.', 'no_credit', d);
      if (st === 429) return say(503, "The AI service is busy, or today's free allowance is used up. Type the grams instead.", 'ai_busy', d);
      if (st === 401 || st === 403) return say(503, 'The AI key on the server was refused. It may be mistyped or switched off.', 'bad_key', d);
      if (st === 404) return say(503, 'The AI model set on the server was not found. It may have been retired.', 'no_model', d);
      if (st === 400) return say(422, "The AI service couldn't use those photos.", 'ai_refused', d);
      return say(502, "The photo couldn't be read just now. Try again, or type the grams.", 'ai_failed', d);
    }
  }
  if (day) {
    try {
      const prompt = sleep ? SLEEP_HEAD(imgs.length, ctx) + REPLY + SLEEP_SHAPE : DAY_HEAD(imgs.length, ctx) + REPLY + DAY_SHAPE;
      const text = which === 'gemini' ? await gemini(f, key, model, !!fixed, imgs, prompt) : which === 'claude' ? await claude(f, key, model, imgs, prompt) : await openai(f, key, model, !!fixed, imgs, prompt);
      const out = sleep ? tidySleep(text) : tidyDay(text);
      if (out.shows === 'workout') return json(200, { day: null, shows: 'workout', note: out.note, by: which, read: imgs.length });
      if (!out.day) return say(422, sleep ? "No sleep numbers could be read in those screenshots. Try your watch app's sleep summary." : "No activity numbers could be read in those screenshots. Try your watch app's summary for the day.", 'no_data');
      return json(200, { day: out.day, shows: 'day', note: out.note, by: which, read: imgs.length });
    } catch (e) {
      const st = e instanceof Upstream ? e.status : 0, d = which + ' day ' + (st || 'error');
      console.error(`gd-meal-photo: day read gave up (${d})`);
      if (st === 402) return say(503, SPENT + 'Type the numbers for now.', 'no_credit', d);
      if (st === 429) return say(503, "The AI service is busy, or today's free allowance is used up. Try again later.", 'ai_busy', d);
      if (st === 401 || st === 403) return say(503, 'The AI key on the server was refused. It may be mistyped or switched off.', 'bad_key', d);
      if (st === 404) return say(503, 'The AI model set on the server was not found. It may have been retired.', 'no_model', d);
      if (st === 400) return say(422, "The AI service couldn't use those screenshots.", 'ai_refused', d);
      return say(502, "The AI service couldn't read the screenshots just now. Try again.", 'ai_failed', d);
    }
  }
  if (workout) {
    try {
      const prompt = WORKOUT_HEAD(imgs.length, ctx) + REPLY + WORKOUT_SHAPE;
      const text = which === 'gemini' ? await gemini(f, key, model, !!fixed, imgs, prompt) : which === 'claude' ? await claude(f, key, model, imgs, prompt) : await openai(f, key, model, !!fixed, imgs, prompt);
      const out = tidyWorkout(text);
      if (!out.workout) return say(422, "No workout numbers could be read in those screenshots. Try the summary screen of your watch's app, or type the calories.", 'no_data');
      return json(200, { workout: out.workout, note: out.note, by: which, read: imgs.length });
    } catch (e) {
      const st = e instanceof Upstream ? e.status : 0, d = which + ' workout ' + (st || 'error');
      console.error(`gd-meal-photo: workout read gave up (${d})`);
      if (st === 402) return say(503, SPENT + 'Type the calories for now.', 'no_credit', d);
      if (st === 429) return say(503, "The AI service is busy, or today's free allowance is used up. Type the calories.", 'ai_busy', d);
      if (st === 401 || st === 403) return say(503, 'The AI key on the server was refused. It may be mistyped or switched off.', 'bad_key', d);
      if (st === 404) return say(503, 'The AI model set on the server was not found. It may have been retired.', 'no_model', d);
      if (st === 400) return say(422, "The AI service couldn't use those screenshots. Type the calories.", 'ai_refused', d);
      return say(502, "The AI service couldn't read the screenshots just now. Try again, or type the calories.", 'ai_failed', d);
    }
  }
  try {
    const nut = kind === 'meal' && !!(body && body.nut);            // v1.26: nutrients first, calories calculated here
    const hid = nut && !!(body && body.hid);                          // v1.29: and what a photo can't show, to ask about
    const prompt = promptFor(kind, ask, answers, !!(body && body.out), !!(body && body.grams), imgs.length, nut, hid);
    const text = which === 'gemini' ? await gemini(f, key, model, !!fixed, imgs, prompt) : which === 'claude' ? await claude(f, key, model, imgs, prompt) : await openai(f, key, model, !!fixed, imgs, prompt);
    if (kind === 'supp') {
      const out = tidySupp(text, ask), qs = out.questions || [];
      if ((!out.supp || !out.supp.items.length) && !qs.length) return say(422, "No vitamins or minerals could be read in that photo. Try a sharper photo of the list on the pack, or type them in.", 'no_label');
      return json(200, ask ? { supp: out.supp, note: out.note, questions: qs, by: which } : { supp: out.supp, note: out.note, by: which });
    }
    if (isLabel) {
      const out = tidyLabel(text, ask), qs = out.questions || [];
      if (!out.label && !qs.length) return say(422, "No label could be read in that photo. Try a sharper photo of the nutrition table, or type what it says.", 'no_label');
      return json(200, ask ? { label: out.label, note: out.note, questions: qs, by: which } : { label: out.label, note: out.note, by: which });
    }
    const out = nut ? tidyNut(text, ask) : tidy(text, ask), qs = out.questions || [];
    if (!out.items.length && !qs.length) return say(422, "No food could be made out in that photo. Type what it was and its calories.", 'no_food');
    const calc = nut ? { calc: 1 } : {};
    return json(200, ask ? { items: out.items, note: out.note, questions: qs, by: which, ...calc } : { items: out.items, note: out.note, by: which, ...calc });
  } catch (e) {
    const st = e instanceof Upstream ? e.status : 0, d = which + ' ' + (st || 'error');
    console.error(`gd-meal-photo: gave up (${d})`);
    if (st === 402) return say(503, SPENT + typeIt, 'no_credit', d);
    if (st === 429) return say(503, "The AI service is busy, or today's free allowance is used up. " + typeIt, 'ai_busy', d);
    if (st === 401 || st === 403) return say(503, 'The AI key on the server was refused. It may be mistyped or switched off.', 'bad_key', d);
    if (st === 404) return say(503, 'The AI model set on the server was not found. It may have been retired.', 'no_model', d);
    if (st === 400) return say(422, "The AI service couldn't use that photo. " + (isLabel ? 'Type what the label says.' : 'Type what it was and its calories.'), 'ai_refused', d);
    return say(502, "The AI service couldn't read the photo just now. Try again, or " + (isLabel ? 'type what the label says.' : 'type the calories.'), 'ai_failed', d);
  }
}

// @ts-ignore: Deno is the runtime Supabase gives Edge Functions
if (typeof Deno !== 'undefined') Deno.serve((req: Request) => handler(req, (k: string) => Deno.env.get(k), fetch));
