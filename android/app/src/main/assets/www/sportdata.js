// GymDay v1.17: sports and exercise for "Add an activity", with their energy cost in METs (1 MET = the energy used sitting still,
// about 1 kcal per kg of body weight an hour). Values are from the 2024 Adult Compendium of Physical Activities (Herrmann SD, Willis EA,
// Ainsworth BE et al., Journal of Sport and Health Science 2024;13:6-12; pacompendium.com), read in November 2026. "est." marks a value
// the Compendium itself lists as estimated rather than measured. Games the Compendium doesn't list (kabaddi, kho-kho and the other Indian
// games) are counted like the closest game it does list, and their note says which.
//
// Each row: [id, emoji, name, group, search words, [easy, moderate, hard, all out] METs, where they come from, popular (1), kinds]
//   A 0 in the four is worked out by sports.js from the others (easy = moderate × 0.75, hard = moderate × 1.3, all out = hard × 1.15,
//   which is about how the Compendium's own easy and hard entries for the same sport differ).
//   kinds: [label, MET, code] for a speed or stroke the person may know; picking one uses that value as it is.
window.SPORTDATA = {
  v: 1,
  src: '2024 Adult Compendium of Physical Activities (Herrmann et al., 2024; pacompendium.com)',
  groups: [['pop', 'Popular', '⭐'], ['team', 'Team sports', '🏏'], ['racket', 'Racket sports', '🏸'], ['run', 'Running, walking and athletics', '🏃'],
    ['bike', 'Cycling', '🚴'], ['water', 'Swimming and water', '🏊'], ['fit', 'Fitness and workouts', '🔥'], ['mind', 'Yoga and stretching', '🧘'],
    ['dance', 'Dance', '💃'], ['combat', 'Combat and martial arts', '🥋'], ['india', 'Indian games', '🤼'], ['out', 'Outdoor and adventure', '🧗'],
    ['snow', 'Snow and ice', '⛷️'], ['other', 'Other sports', '🎯']],
  list: [
    // ---------------- team sports ----------------
    ['cricket', '🏏', 'Cricket', 'team', 'gully cricket tennis ball batting bowling fielding nets', [0, 4.8, 0, 0], '15150 batting, bowling, fielding: 4.8', 1],
    ['football', '⚽', 'Football (soccer)', 'team', 'soccer futsal five a side 5-a-side', [0, 7.0, 9.5, 0], '15610 casual, general: 7.0 · 15605 competitive: 9.5', 1],
    ['basketball', '🏀', 'Basketball', 'team', 'hoops shooting', [5.0, 6.0, 8.0, 9.3], '15070 shooting baskets: 5.0 · 15050 non-game, general: 6.0 · 15040 game: 8.0 · 15072 drills, practice: 9.3', 1],
    ['volleyball', '🏐', 'Volleyball', 'team', 'volley ball', [3.0, 4.0, 6.0, 0], '15720 non-competitive: 3.0 · 15710 general: 4.0 · 15711 competitive, in a gym: 6.0', 1,
      [['On sand (beach volleyball)', 8.0, '15725 beach, in sand (est.)']]],
    ['hockey', '🏑', 'Hockey (field)', 'team', 'field hockey', [0, 7.8, 0, 0], '15350 field hockey: 7.8', 1],
    ['rugby', '🏉', 'Rugby', 'team', 'touch rugby', [0, 6.3, 8.3, 0], '15562 touch, non-competitive: 6.3 · 15560 union, competitive: 8.3'],
    ['handball', '🤾', 'Handball', 'team', 'team handball', [0, 8.0, 0, 0], '15330 team handball: 8.0 (est.)'],
    ['baseball', '⚾', 'Baseball or softball', 'team', 'softball', [4.0, 5.0, 6.0, 0], '15625 softball practice: 4.0 · 15620 general: 5.0 · 15640 pitching: 6.0 (est.)'],
    ['amfootball', '🏈', 'American football', 'team', 'touch football flag football gridiron', [4.0, 8.0, 0, 0], '15232 touch or flag, light: 4.0 (est.) · 15230 touch or flag, general: 8.0 · 15210 competitive: 8.0'],
    ['ultimate', '🥏', 'Ultimate frisbee', 'team', 'frisbee ultimate', [0, 8.0, 0, 0], '15250 ultimate frisbee: 8.0 (est.)'],
    ['netball', '🏐', 'Netball', 'team', '', [0, 7.0, 0, 0], '15477 netball: 7.0 (est.)'],
    ['lacrosse', '🥍', 'Lacrosse', 'team', '', [0, 8.0, 0, 0], '15460 lacrosse: 8.0 (est.)'],
    ['kickball', '⚽', 'Kickball', 'team', '', [0, 7.0, 0, 0], '15450 kickball: 7.0 (est.)'],
    ['playground', '🤸', 'Playground games (tag, dodgeball, hopscotch)', 'team', 'tag catch catching chor police dodgeball hopscotch four square games with children kids', [0, 5.8, 0, 0], "15135 children's games, moderate effort: 5.8"],

    // ---------------- racket sports ----------------
    ['badminton', '🏸', 'Badminton', 'racket', 'shuttle shuttlecock', [0, 5.5, 7.0, 9.0], '15030 social, singles and doubles: 5.5 · 15020 competitive: 7.0 · 15025 competitive, match play: 9.0', 1],
    ['tennis', '🎾', 'Tennis', 'racket', 'lawn tennis singles doubles', [4.5, 6.8, 8.0, 0], '15685 doubles: 4.5 · 15675 general, moderate effort: 6.8 · 15676 competitive: 8.0', 1],
    ['tabletennis', '🏓', 'Table tennis', 'racket', 'ping pong tt', [0, 4.0, 0, 0], '15660 table tennis: 4.0', 1],
    ['squash', '🎾', 'Squash', 'racket', '', [0, 7.3, 12.0, 0], '15652 general: 7.3 · 15650 squash: 12.0'],
    ['racquetball', '🎾', 'Racquetball', 'racket', '', [0, 7.0, 10.0, 0], '15530 general: 7.0 · 15520 competitive: 10.0 (est.)'],
    ['pickleball', '🏓', 'Pickleball', 'racket', 'pickle ball padel', [0, 4.5, 6.0, 0], 'Not in the Compendium: counted like doubles tennis (15685: 4.5, 15680: 6.0)'],
    ['paddleball', '🏓', 'Paddleball', 'racket', '', [0, 6.0, 10.0, 0], '15500 casual, general: 6.0 · 15490 competitive: 10.0 (est.)'],

    // ---------------- running, walking, athletics ----------------
    ['running', '🏃', 'Running', 'run', 'run jog jogging treadmill morning run marathon 5k 10k', [6.5, 9.0, 10.5, 12.0], '12028 about 6.5 km/h: 6.5 · 12045 about 9 km/h: 9.0 · 12145 own pace: 10.5 · 12090 about 13 km/h: 12.0', 1,
      [['6.5 km/h (9:15 a km)', 6.5, '12028'], ['7.5 km/h (8:00 a km)', 7.8, '12029'], ['8 km/h (7:30 a km)', 8.5, '12030'], ['9 km/h (6:40 a km)', 9.0, '12045'],
        ['10 km/h (6:00 a km)', 9.3, '12050'], ['11 km/h (5:27 a km)', 10.5, '12060'], ['12 km/h (5:00 a km)', 11.8, '12080'], ['13 km/h (4:37 a km)', 12.0, '12090'],
        ['14 km/h (4:17 a km)', 12.5, '12100'], ['15 km/h (4:00 a km)', 14.8, '12115'], ['16 km/h (3:45 a km)', 14.8, '12120'], ['18 km/h (3:20 a km)', 16.8, '12130'],
        ['19 km/h or faster', 18.5, '12132'], ['Cross country, trails', 9.3, '12140']]],
    ['walking', '🚶', 'Walking', 'run', 'walk stroll brisk walk morning walk evening walk treadmill walk walking to school', [2.8, 3.8, 4.8, 5.5], '17152 slow: 2.8 · 17190 moderate: 3.8 · 17200 brisk: 4.8 · 17220 very brisk: 5.5', 1,
      [['Slow, under 3.2 km/h', 2.3, '17151'], ['3.2 to 3.9 km/h', 2.8, '17152'], ['4 km/h', 3.0, '17170'], ['4.5 to 5.5 km/h', 3.8, '17190'], ['5.6 to 6.3 km/h (brisk)', 4.8, '17200'],
        ['6.4 to 7.1 km/h (very brisk)', 5.5, '17220'], ['7.2 to 7.9 km/h', 7.0, '17230'], ['8 km/h or faster', 8.5, '17231'], ['Uphill, a 6 to 10% slope', 7.0, '17035']]],
    ['hiking', '🥾', 'Hiking or trekking', 'run', 'trek trekking hike hills mountains', [3.8, 5.3, 6.0, 7.8], '17081 slowly, no load: 3.8 · 17082 normal pace, hills: 5.3 · 17080 cross country: 6.0 · 17012 with a daypack: 7.8', 1],
    ['backpacking', '🎒', 'Trekking with a heavy backpack', 'run', 'backpack rucksack load', [0, 7.0, 7.8, 0], '17010 backpacking: 7.0 · 17012 with a daypack: 7.8'],
    ['stairs', '🪜', 'Climbing stairs', 'run', 'stair steps staircase', [4.5, 6.8, 9.3, 0], '17133 slow: 4.5 · 17131 general: 6.8 · 17134 fast: 9.3'],
    ['nordic', '🚶', 'Nordic walking', 'run', 'poles', [4.3, 5.3, 8.5, 0], '17302 moderate, 4 to 5.6 km/h: 4.3 · 17304 5.8 to 7 km/h: 5.3 · 17305 fast: 8.5'],
    ['racewalk', '🚶', 'Race walking', 'run', '', [0, 6.5, 0, 0], '17110 race walking: 6.5 (est.)'],
    ['track', '🏃', 'Athletics: sprints and track practice', 'run', 'sprint sprints 100m 200m 400m track and field relay', [0, 10.0, 0, 0], '12180 track, team practice: 10.0 (est.)'],
    ['hurdles', '🏃', 'Athletics: hurdles or steeplechase', 'run', 'track and field', [0, 10.0, 0, 0], '15734 hurdles, steeplechase: 10.0 (est.)'],
    ['jumps', '🏃', 'Athletics: jumps or javelin', 'run', 'long jump high jump triple jump pole vault javelin track and field', [0, 6.0, 0, 0], '15733 jumps, javelin: 6.0 (est.)'],
    ['throws', '🏃', 'Athletics: shot put, discus or hammer', 'run', 'shot put discus hammer throw track and field', [0, 4.0, 0, 0], '15732 shot, discus, hammer: 4.0 (est.)'],

    // ---------------- cycling ----------------
    ['cycling', '🚴', 'Cycling', 'bike', 'cycle bicycle bike ride riding cycling to school', [4.0, 6.8, 8.0, 10.0], '01010 leisure, under 16 km/h: 4.0 · 01020 16 to 19 km/h: 6.8 · 01030 19 to 22 km/h: 8.0 · 01040 22 to 26 km/h: 10.0', 1,
      [['Under 16 km/h, easy', 4.0, '01010'], ['About 15 km/h', 5.8, '01019'], ['16 to 19 km/h', 6.8, '01020'], ['19 to 22 km/h', 8.0, '01030'], ['22 to 26 km/h', 10.0, '01040'],
        ['26 to 31 km/h, racing', 12.0, '01050 (est.)'], ['32 km/h or faster', 16.8, '01060']]],
    ['mtb', '🚵', 'Mountain biking', 'bike', 'mtb trail cycling', [0, 8.5, 14.0, 16.0], '01009 general: 8.5 (est.) · 01003 uphill, vigorous: 14.0 · 01004 racing: 16.0'],
    ['statbike', '🚴', 'Stationary bike', 'bike', 'exercise bike gym cycle indoor cycling', [4.0, 6.8, 8.0, 10.8], '01214 50 W: 4.0 · 01200 general: 6.8 · 01228 126 to 150 W: 8.0 · 01236 200 to 229 W: 10.8'],
    ['spin', '🚴', 'Spin class', 'bike', 'spinning rpm class', [0, 9.0, 0, 0], '01270 RPM or spin class: 9.0'],
    ['ebike', '🚲', 'E-bike', 'bike', 'electric bike', [4.0, 6.0, 6.8, 0], '01088 high support: 4.0 · 01084 light support: 6.0 · 01080 no support: 6.8'],
    ['bmx', '🚲', 'BMX', 'bike', '', [0, 8.5, 0, 0], '01008 BMX: 8.5 (est.)'],
    ['unicycle', '🚲', 'Unicycling', 'bike', '', [0, 5.0, 0, 0], '01070 unicycling: 5.0 (est.)'],

    // ---------------- swimming and water ----------------
    ['swimming', '🏊', 'Swimming laps', 'water', 'swim pool laps freestyle', [5.8, 8.0, 9.8, 10.5], '18240 freestyle, slow: 5.8 · 18290 crawl, about 45 m a minute: 8.0 · 18230 freestyle, fast: 9.8 · 18280 crawl, about 70 m a minute: 10.5', 1,
      [['Freestyle, slow', 5.8, '18240'], ['Freestyle, about 45 m a minute', 8.0, '18290'], ['Freestyle, about 70 m a minute', 10.5, '18280'], ['Breaststroke, easy', 5.3, '18265'],
        ['Breaststroke, training', 10.3, '18260'], ['Backstroke, easy', 4.8, '18255'], ['Backstroke, training', 9.5, '18250'], ['Butterfly', 13.8, '18270'], ['Sidestroke', 7.0, '18320']]],
    ['swimfun', '🏊', 'Swimming for fun (pool, sea, river)', 'water', 'swim splash beach', [0, 6.0, 0, 0], '18310 leisurely, general: 6.0'],
    ['aquafit', '🤽', 'Water aerobics', 'water', 'aqua aerobics aqua fit', [0, 5.5, 7.5, 0], '18355 general: 5.5 · 18358 high intensity: 7.5'],
    ['treading', '🏊', 'Treading water', 'water', '', [0, 3.5, 9.8, 0], '18350 moderate: 3.5 · 18340 fast: 9.8'],
    ['waterpolo', '🤽', 'Water polo', 'water', '', [0, 10.0, 0, 0], '18360 water polo: 10.0 (est.)'],
    ['kayak', '🛶', 'Kayaking', 'water', 'kayak', [0, 5.0, 12.5, 13.5], '18100 moderate: 5.0 · 18060 over 10 km/h: 12.5 · 18104 competition: 13.5'],
    ['rowing', '🚣', 'Rowing or canoeing (boat)', 'water', 'canoe boat row', [2.8, 5.8, 12.5, 0], '18040 3 to 6 km/h: 2.8 · 18050 6.5 to 9.5 km/h: 5.8 · 18060 over 10 km/h: 12.5'],
    ['sup', '🏄', 'Stand-up paddleboarding', 'water', 'sup paddle board', [3.8, 6.5, 9.8, 0], '18226 20 to 29 strokes a minute: 3.8 · 18224 general: 6.5 · 18228 40 to 49 strokes a minute: 9.8'],
    ['surfing', '🏄', 'Surfing', 'water', 'surf', [0, 3.0, 5.0, 0], '18220 general: 3.0 (est.) · 18222 competitive: 5.0 (est.)'],
    ['snorkel', '🤿', 'Snorkelling', 'water', 'snorkeling', [0, 5.0, 0, 0], '18210 snorkelling: 5.0'],
    ['waterski', '🎿', 'Water skiing or wakeboarding', 'water', 'wakeboard', [0, 6.0, 0, 0], '18150 water skiing or wakeboarding: 6.0'],
    ['sailing', '⛵', 'Sailing or windsurfing', 'water', 'windsurf', [0, 3.0, 4.5, 9.3], '18120 general: 3.0 · 18130 competition: 4.5 · 18132 competition, high effort: 9.3'],

    // ---------------- fitness and workouts ----------------
    ['skipping', '➰', 'Skipping rope', 'fit', 'jump rope rope jumping skipping', [8.3, 11.8, 12.3, 0], '15552 under 100 skips a minute: 8.3 · 15551 100 to 120: 11.8 · 15550 120 to 160: 12.3', 1,
      [['Under 100 skips a minute', 8.3, '15552'], ['100 to 120 a minute', 11.8, '15551'], ['120 to 160 a minute', 12.3, '15550'], ['Double-unders', 10.0, '15554']]],
    ['hiit', '🔥', 'HIIT', 'fit', 'high intensity interval training tabata burpees', [0, 7.0, 11.0, 0], '02210 moderate: 7.0 · 02214 burpees, squat jumps, vigorous: 11.0', 1],
    ['home', '💪', 'Home workout (push-ups, squats, burpees)', 'fit', 'calisthenics bodyweight push ups sit ups crunches plank jumping jacks lunges', [2.8, 3.8, 7.5, 0], '02024 crunches, plank, light: 2.8 · 02022 push-ups, sit-ups, lunges, moderate: 3.8 · 02020 push-ups, jumping jacks, burpees, vigorous: 7.5', 1],
    ['circuit', '🔁', 'Circuit training', 'fit', 'circuit crossfit functional', [3.5, 5.0, 7.5, 0], '02034 light: 3.5 · 02035 moderate: 5.0 · 02040 with kettlebells, vigorous: 7.5'],
    ['aerobics', '🤸', 'Aerobics', 'fit', 'aerobic dance class', [4.8, 7.3, 8.0, 0], '02005 low impact: 4.8 · 02000 general: 7.3 · 02006 high impact: 8.0'],
    ['step', '🤸', 'Step aerobics', 'fit', 'step class', [5.5, 7.3, 9.0, 0], '02001 10 cm step: 5.5 · 02002 15 to 20 cm step: 7.3 · 02003 25 to 30 cm step: 9.0'],
    ['zumba', '💃', 'Zumba', 'fit', 'dance fitness', [5.5, 6.5, 0, 0], '02315 home video: 5.5 · 02310 group class: 6.5', 1],
    ['elliptical', '🏃', 'Elliptical trainer', 'fit', 'cross trainer', [0, 5.0, 9.0, 0], '02048 moderate: 5.0 · 02049 vigorous: 9.0'],
    ['rowerg', '🚣', 'Rowing machine', 'fit', 'rower erg ergometer', [5.0, 7.5, 11.0, 14.0], '02071 under 100 W: 5.0 · 02072 100 to 149 W: 7.5 · 02073 150 to 199 W: 11.0 · 02074 200 W or more: 14.0'],
    ['stepper', '🪜', 'Stair climber machine', 'fit', 'stairmaster stepper stair treadmill', [0, 9.3, 0, 0], '02065 stair treadmill: 9.3'],
    ['kettlebell', '🏋️', 'Kettlebell workout', 'fit', 'kettlebells swings', [0, 7.5, 9.8, 0], '02040 circuit with kettlebells: 7.5 · 02058 kettlebell swings: 9.8'],
    ['bootcamp', '🪖', 'Boot camp or obstacle course', 'fit', 'obstacle course army', [0, 5.0, 0, 0], '02008 army-type obstacle course: 5.0'],
    ['video', '📺', 'Workout video at home', 'fit', 'youtube workout follow along', [2.5, 4.0, 6.0, 0], '02140 light (yoga, stretching): 2.5 · 02143 moderate: 4.0 · 02145 vigorous: 6.0'],
    ['fitclass', '🏋️', 'Fitness class (general)', 'fit', 'gym class group class', [0, 5.5, 0, 0], '02060 health club exercise, general: 5.5'],

    // ---------------- yoga and stretching ----------------
    ['yoga', '🧘', 'Yoga', 'mind', 'asana hatha power yoga vinyasa pranayama', [2.0, 2.3, 4.0, 0], '02170 Nadisodhana: 2.0 · 02175 general: 2.3 · 02160 power yoga: 4.0', 1],
    ['surya', '🧘', 'Surya namaskar', 'mind', 'sun salutation suryanamaskar surya namaskara', [0, 3.5, 0, 0], '02180 Surya namaskar: 3.5', 1],
    ['pilates', '🧘', 'Pilates', 'mind', '', [1.8, 2.8, 0, 0], '02103 traditional mat: 1.8 · 02105 general: 2.8'],
    ['stretching', '🙆', 'Stretching', 'mind', 'stretch mobility warm up cool down', [0, 2.3, 0, 0], '02101 mild stretching: 2.3'],
    ['taichi', '🧘', 'Tai chi or qigong', 'mind', 'tai chi qigong chi gong', [0, 3.3, 0, 0], '15670 general: 3.3'],

    // ---------------- dance ----------------
    ['bollywood', '💃', 'Bollywood dance', 'dance', 'filmi dance hindi songs', [4.3, 5.0, 6.5, 9.8], 'Not in the Compendium: counted like 03072 contemporary dance: 4.3 · 03033 folk dance, moderate: 5.0 · 02310 a Zumba class: 6.5 · 03031 vigorous folk dance: 9.8', 1],
    ['classical', '💃', 'Indian classical dance', 'dance', 'bharatanatyam kathak odissi kuchipudi mohiniyattam manipuri kathakali sattriya', [0, 4.5, 6.8, 0], "03025 ethnic or cultural dance: 4.5 (est.) · 03012 dance performance: 6.8"],
    ['folk', '💃', 'Folk dance (bhangra, garba, dandiya)', 'dance', 'bhangra garba dandiya lavani ghoomar bihu giddha', [0, 5.0, 9.8, 0], '03033 folk dance, moderate: 5.0 · 03031 folk dance, vigorous: 9.8'],
    ['dance', '💃', 'Dancing (party or freestyle)', 'dance', 'party club dancing freestyle hip hop', [3.8, 4.3, 9.8, 0], '03070 contemporary: 3.8 · 03072 contemporary, nightclub: 4.3 · 03031 nightclub, vigorous: 9.8'],
    ['danceclass', '💃', 'Dance class (hip hop, jazz, contemporary)', 'dance', 'hip hop jazz contemporary modern', [3.8, 4.5, 6.8, 0], '03070 contemporary: 3.8 · 03078 jazz: 4.5 · 03012 performance: 6.8'],
    ['ballet', '🩰', 'Ballet', 'dance', '', [0, 5.0, 6.3, 6.8], '03010 class: 5.0 · 03011 ballet exercises: 6.3 · 03012 performance: 6.8'],
    ['salsa', '💃', 'Salsa or partner dance', 'dance', 'ballroom bachata', [0, 4.8, 6.0, 0], '03090 salsa with a partner: 4.8 · 03005 Afro-Cuban salsa: 6.0'],
    ['ballroom', '💃', 'Ballroom dancing', 'dance', 'waltz tango', [3.0, 5.5, 11.3, 0], '03040 slow: 3.0 · 03030 fast: 5.5 · 03038 competitive: 11.3'],

    // ---------------- combat and martial arts ----------------
    ['boxing', '🥊', 'Boxing', 'combat', 'punching bag sparring', [5.8, 7.8, 9.3, 12.3], '15110 punching bag: 5.8 · 15120 sparring: 7.8 · 15125 a simulated round: 9.3 · 15100 in the ring: 12.3'],
    ['martial', '🥋', 'Martial arts (karate, judo, taekwondo)', 'combat', 'karate judo taekwondo kung fu jujitsu muay thai mma', [5.3, 10.3, 11.3, 0], '15425 slower pace, novice: 5.3 · 15430 moderate pace: 10.3 · 15433 judo: 11.3'],
    ['kickboxing', '🥊', 'Kickboxing', 'combat', '', [0, 7.3, 0, 0], '15457 kickboxing: 7.3'],
    ['wrestling', '🤼', 'Wrestling', 'combat', 'kushti akhada', [0, 6.0, 0, 0], '15730 wrestling: 6.0 (est.)'],
    ['fencing', '🤺', 'Fencing', 'combat', '', [0, 6.0, 9.8, 0], '15200 general: 6.0 · 15203 épée, competitive: 9.8'],

    // ---------------- Indian games ----------------
    ['kabaddi', '🤼', 'Kabaddi', 'india', 'kabbadi hu tu tu chadugudu', [0, 6.3, 8.3, 0], 'Not in the Compendium: counted like rugby, another running and tackling game (15562 touch: 6.3 · 15560 competitive: 8.3)', 1],
    ['khokho', '🏃', 'Kho-kho', 'india', 'kho kho', [0, 5.8, 8.0, 0], "Not in the Compendium: counted like chasing games (15135 children's games: 5.8) and ultimate frisbee (15250: 8.0)"],
    ['throwball', '🏐', 'Throwball', 'india', 'throw ball', [3.0, 4.0, 6.0, 0], 'Not in the Compendium: counted like volleyball (15720: 3.0 · 15710: 4.0 · 15711: 6.0)'],
    ['gilli', '🏏', 'Gilli-danda', 'india', 'gulli danda viti dandu', [4.0, 5.0, 6.0, 0], 'Not in the Compendium: counted like softball (15625: 4.0 · 15620: 5.0 · 15640: 6.0)'],
    ['lagori', '🪨', 'Lagori (seven stones)', 'india', 'pitthu pittu lingorcha seven stones satoliya', [0, 5.8, 0, 0], "Not in the Compendium: counted like children's ball games (15135: 5.8)"],
    ['langdi', '🦶', 'Langdi', 'india', 'langdi tang hopping game', [0, 5.8, 0, 0], "Not in the Compendium: counted like children's games (15135: 5.8)"],
    ['mallakhamb', '🤸', 'Mallakhamb', 'india', 'mallakhamba pole gymnastics rope mallakhamb', [3.8, 6.0, 0, 0], 'Not in the Compendium: counted like gymnastics (15300 general: 3.8 · 15138 competitive moves: 6.0)'],
    ['kalari', '🥋', 'Kalaripayattu, silambam or gatka', 'india', 'kalari kalaripayattu silambam gatka thang ta stick fighting', [5.3, 10.3, 0, 0], 'Not in the Compendium by name: counted as martial arts (15425 slower pace: 5.3 · 15430 moderate pace: 10.3)'],

    // ---------------- outdoor and adventure ----------------
    ['climbing', '🧗', 'Rock climbing or bouldering', 'out', 'climbing wall bouldering rock climbing', [5.8, 8.0, 10.5, 0], '15537 low to moderate difficulty: 5.8 · 15533 rock climbing: 8.0 · 15536 speed climbing: 10.5'],
    ['horse', '🏇', 'Horse riding', 'out', 'horseback riding equestrian', [3.8, 5.5, 7.3, 9.0], '15400 walking: 3.8 · 15370 general: 5.5 · 15395 canter or gallop: 7.3 · 15402 jumping: 9.0'],
    ['skating', '🛼', 'Roller or inline skating', 'out', 'skates roller skating inline', [0, 7.0, 9.8, 12.3], '15590 roller skating: 7.0 · 15592 inline, about 18 km/h: 9.8 · 15593 inline, about 21 km/h: 12.3'],
    ['skateboard', '🛹', 'Skateboarding', 'out', 'longboard', [0, 5.0, 6.0, 0], '15580 general: 5.0 (est.) · 15582 competitive: 6.0 (est.)'],
    ['trampoline', '🤸', 'Trampoline', 'out', 'trampoline park', [0, 6.3, 10.3, 0], '15700 recreational: 6.3 · 15702 competitive: 10.3'],
    ['gymnastics', '🤸', 'Gymnastics', 'out', 'tumbling cheerleading', [0, 3.8, 6.0, 0], '15300 general: 3.8 · 15138 competitive cheerleading moves: 6.0 (est.)'],
    ['orienteering', '🧭', 'Orienteering', 'out', '', [0, 9.0, 0, 0], '15480 orienteering: 9.0 (est.)'],
    ['golf', '⛳', 'Golf', 'out', 'driving range', [3.5, 4.5, 0, 0], '15270 driving range: 3.5 · 15255 general: 4.5'],

    // ---------------- snow and ice ----------------
    ['iceskating', '⛸️', 'Ice skating', 'snow', 'skating rink', [5.5, 7.0, 9.0, 13.8], '19020 slow: 5.5 · 19030 general: 7.0 · 19040 fast: 9.0 · 19050 speed skating: 13.8'],
    ['icehockey', '🏒', 'Ice hockey', 'snow', '', [0, 8.0, 10.0, 0], '15360 general: 8.0 · 15362 competitive: 10.0'],
    ['skiing', '⛷️', 'Skiing (downhill)', 'snow', 'ski alpine', [4.3, 6.3, 8.0, 0], '19150 light: 4.3 · 19160 moderate: 6.3 · 19170 vigorous: 8.0'],
    ['xcski', '⛷️', 'Cross-country skiing', 'snow', 'nordic skiing', [6.8, 8.5, 11.3, 14.0], '19080 slow: 6.8 · 19090 moderate: 8.5 · 19100 vigorous: 11.3 · 19110 racing: 14.0'],
    ['snowboard', '🏂', 'Snowboarding', 'snow', '', [0, 7.5, 0, 0], '19201 recreational: 7.5'],
    ['sledding', '🛷', 'Sledding', 'snow', 'toboggan luge', [0, 7.0, 0, 0], '19180 sledding: 7.0'],
    ['snowshoe', '🥾', 'Snowshoeing', 'snow', '', [0, 5.3, 10.0, 0], '19190 moderate: 5.3 · 19192 vigorous: 10.0'],

    // ---------------- other sports ----------------
    ['bowling', '🎳', 'Bowling (ten-pin)', 'other', 'bowling alley', [0, 3.0, 3.8, 0], '15090 bowling: 3.0 · 15092 indoor alley: 3.8'],
    ['archery', '🏹', 'Archery', 'other', '', [0, 4.3, 0, 0], '15010 archery: 4.3'],
    ['frisbee', '🥏', 'Frisbee (throwing around)', 'other', 'disc', [0, 3.0, 0, 0], '15240 frisbee, general: 3.0 (est.)'],
    ['billiards', '🎱', 'Snooker, pool or billiards', 'other', 'snooker pool cue', [0, 2.5, 0, 0], '15080 billiards: 2.5'],
    ['darts', '🎯', 'Darts', 'other', '', [0, 2.5, 0, 0], '15180 darts: 2.5 (est.)'],
    ['other', '🏅', 'Another sport or activity', 'other', 'other something else', [3.0, 4.5, 6.5, 8.5], 'A sport that is not in the list: light, moderate and vigorous activity as the Compendium groups them (under 3, 3 to 6, 6 and up)']
  ]
};
