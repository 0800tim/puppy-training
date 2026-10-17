/*
 * Puppy Training — all the training content lives in this one file.
 * Edit it freely: add skills, change the plan, swap videos.
 * Video ids are YouTube ids. kind "shorts" opens youtube.com/shorts/<id>.
 * Every video below was checked as live when it was added.
 */
const PUPPY_CONTENT = {

  /* ---------- Family roles ---------- */
  roles: {
    selfcontrol: { name: "Self-control coach", lead: "Wait, It's Yer Choice, Leave it and Stay. The skills that stop a puppy bolting after birds, food or the front door." },
    recall:      { name: "Name & recall coach", lead: "The name game, Come and Touch. Two-person recall games with whoever is home are perfect. Play on the floor, not chasing." },
    tricks:      { name: "Tricks & world coach", lead: "Tricks and confidence. Each session or visit is a mission: one new sound, surface or person, then a trick to show off." },
    manners:     { name: "Manners & routine lead", lead: "Toilet routine, pen and crate, handling for the vet, lead walking, and booking puppy preschool." },
    helper:      { name: "Helper", lead: "Joins in with this week's skills and the biting plan." }
  },

  /* ---------- Sessions ---------- */
  slots: [
    { id: "am", t: "Morning", s: "before school" },
    { id: "pm", t: "Afternoon", s: "after school" },
    { id: "ev", t: "Evening", s: "before bed" }
  ],

  /* ---------- 6-week plan (weeks counted from the plan start date) ---------- */
  weeks: [
    { title: "Settling in", goals: ["Name game", "\"Yes!\" marker", "Sit", "Gentle mouth", "Settle in her pen", "Handling for the vet"],
      skills: ["name", "yes", "sit", "mouth", "handling"],
      note: "Hand-feed part of every meal so she learns people are where good things come from. Biting plan starts today." },
    { title: "Self-control starts", goals: ["Down", "It's Yer Choice", "Wait at the food bowl", "Touch (hand target)", "Come: two-person recall indoors"],
      skills: ["down", "iyc", "bowl", "touch", "come"],
      note: "Keep revising Sit and the name game in the warm-up minute." },
    { title: "Hold it", goals: ["Stay: 1 step, a few seconds", "Leave it", "Drop it (trade game)", "Settle on a mat", "Collar grab game"],
      skills: ["stay", "leaveit", "drop", "settle", "collar"],
      note: "Stay grows in tiny steps: time first, then distance, then distractions." },
    { title: "Out into the world", goals: ["Loose lead in the yard", "Sit before doors open", "Come with a distraction", "Four paws on the floor for greetings", "First trick: Spin"],
      skills: ["lead", "greet", "come", "spin"],
      note: "Second vaccination is often around now. Check the date with your vet." },
    { title: "Preschool ready", goals: ["Old skills in new rooms and the garden", "Sit to say hi to people", "Find it (nose game)", "Shake"],
      skills: ["greet", "findit", "shake"],
      note: "New places make old skills harder. Drop back a step when you change rooms." },
    { title: "Show-offs", goals: ["Roll over", "Play dead (Bang!)", "Stay with 3 steps away", "Come from another room", "Show-and-tell for visitors"],
      skills: ["roll", "bang", "stay", "come"],
      note: "Working-dog brains love jobs. Keep adding one new trick a week after this." }
  ],

  /* ---------- Same words, everyone ---------- */
  cues: [
    ["Yes!", "Exactly that. A treat is coming."], ["Free!", "You can move now. Ends Sit, Down, Wait and Stay."],
    ["Sit", "Bottom on the ground."], ["Down", "Elbows on the ground."], ["Come", "Run to me. Always worth it."],
    ["Wait", "Pause. Don't go through, don't dive in."], ["Stay", "Hold the position until I come back."],
    ["Leave it", "Ignore that. Look at me instead."], ["Drop", "Let go of what's in your mouth. You'll get something better."],
    ["Touch", "Bop my hand with your nose."], ["Bed", "Go to your mat and lie down."], ["Find it", "Sniff out the treats I threw."],
    ["Off", "Four paws on the floor."], ["Uh-oh", "That game's over. Calm voice, no telling off."]
  ],

  rules: [
    "Never tell her off for mistakes. Show her what to do instead and reward that.",
    "Never call \"Come\" for something she won't like (baths, going in her pen). Go and get her instead.",
    "No chasing games with hands or feet, and no running away squealing. Herding and gundog pups chase and nip moving things. Throw a toy instead.",
    "No rough play, no pushing her face away with your hands, no wrestling. It teaches her that hands are toys.",
    "Biting? Swap a toy in. Still biting? Calmly say \"Uh-oh\" and step behind the gate for 30 seconds.",
    "Toilet her straight after waking, eating, playing and every training session.",
    "Puppies need lots of sleep, and most of the worst biting happens when she is over-tired. About an hour up, then a nap in the pen with a chew. A wild, bitey puppy usually needs a nap, not more play.",
    "Kids and puppy together only with an adult in the room for now.",
    "If she lifts the gate latch, clip it shut with a carabiner or cable tie.",
    "Until she is about a year old: self-paced play on grass, short sniffy walks, no stairs before 3 months, and no forced running, jumping or ball-thrower marathons. Brain games tire her out more safely than long runs."
  ],

  social: [
    "Car ride in someone's arms", "Vacuum cleaner from across the room", "Hair dryer and blender", "Hats, hoodies, sunglasses and umbrellas",
    "Wet grass, tiles, carpet, a crinkly tarp", "Visitors of all ages (sit on the floor, let her come to them)", "A calm, fully vaccinated adult dog you know",
    "Carried past a school or shops at pick-up time", "Doorbell and knocking", "Being brushed, having paws held and ears checked",
    "Traffic noise from your arms on the footpath", "The washing machine and dishwasher running", "A ride in a shopping trolley on a blanket",
    "Someone in a high-vis vest or helmet", "Bikes and scooters going past (from a distance)"
  ],

  preschool: "Most puppy preschools take puppies from about 8 weeks once they've had their first vaccination, and many close entry somewhere between 12 and 16 weeks. Waiting for the second jab can miss the window. Ring your vet or local class this week and ask when she can start.",

  /* ---------- Treats ---------- */
  treats: {
    intro: "Her baby teeth need soft treats. Cut everything to pea size so she gets lots of reps without filling up. Treats should stay under about 10% of what she eats in a day.",
    ladder: [
      { c: "lo", l: "Low", t: "Her own kibble", d: "Easy things at home she already knows: Sit, the name game, warm-ups." },
      { c: "md", l: "Medium", t: "Dried liver or soft puppy training treats", d: "Break into crumbs. Use for this week's new skill in a quiet room." },
      { c: "hi", l: "High", t: "Cooked chicken, cheese crumbs, freeze-dried chicken or lamb", d: "Save for Come, new places, Drop it and Leave it. Tiny pieces only." }
    ],
    rota: [["Mon", "Chicken"], ["Tue", "Liver"], ["Wed", "Cheese"], ["Thu", "Freeze-dried lamb"], ["Fri", "Chicken"], ["Sat", "Fish crumbs"], ["Sun", "Surprise mix"]],
    pot: "Each morning, scoop a third of her day's kibble into a jar on the bench and add a few high-value bits. Everyone trains from the pot. When it's empty, training treats are done for the day.",
    never: "Grapes and raisins, chocolate, anything with xylitol (sugar-free gum, some peanut butters: check the label), onion and garlic, macadamia nuts, and cooked bones."
  },

  /* ---------- Skills ---------- */
  skills: [
    { id: "name", nm: "Name game", wk: 1, role: "recall", steps: ["Say her name once in a happy voice.", "The moment she looks at you, say \"Yes!\" and give a treat.", "Do 10 in a row, then try when she's sniffing something.", "Never use her name to tell her off."], done: "She whips her head round when anyone says her name.", v: ["wqoYc4VZCOg"] },
    { id: "yes", nm: "\"Yes!\" marker", wk: 1, role: "all", steps: ["Say \"Yes!\" then give a treat straight away. No asking for anything.", "Repeat 10 times. Soon her ears prick when she hears it.", "From now on, \"Yes!\" marks the exact moment she gets it right."], done: "Her head snaps to you when she hears \"Yes!\".", v: ["kGbYT5zMRVk", "eSgcioJD5Xc"] },
    { id: "sit", req: ["yes"], nm: "Sit", wk: 1, role: "all", lure: "sit", steps: ["Hold a treat at her nose.", "Move it slowly up and back over her head. Her bottom drops.", "\"Yes!\" the instant her bottom touches, then treat.", "After 5 good ones, say \"Sit\" first, then do the hand movement."], done: "Sits on the word alone, 4 times out of 5, in the kitchen.", v: ["kGbYT5zMRVk", "8DHyOAvGwGw"] },
    { id: "mouth", nm: "Gentle mouth", wk: 1, role: "all", help: "biting", steps: ["Always have a tug toy in your pocket.", "Teeth on skin? Freeze, swap a toy into her mouth, praise when she bites the toy.", "Still biting? \"Uh-oh\", stand up, step behind the gate for 30 seconds.", "Over-tired bitey puppy = toilet, then pen and a nap."], done: "Most play goes to toys and she lets go of hands when you go still.", v: ["c77--cCHPyU", "eb9qNHCSbMI"] },
    { id: "handling", nm: "Handling for the vet", wk: 1, role: "manners", steps: ["Touch a paw for 1 second, treat. Ear, treat. Lift a lip, treat.", "Build up to holding a paw for 3 seconds.", "Stop before she wriggles. Always end on a calm touch."], done: "She stays relaxed while you check paws, ears and teeth.", v: ["AoM9tis3t2c", "h9DMT0E83Q4"] },
    { id: "down", req: ["sit"], nm: "Down", wk: 2, role: "all", lure: "down", steps: ["Start from a Sit.", "Move the treat straight down between her front paws, then slowly along the floor.", "\"Yes!\" when her elbows touch, and treat while she's still lying down.", "Add the word \"Down\" once she's following your hand easily."], done: "Drops on the word from a Sit, 4 times out of 5.", v: ["8DHyOAvGwGw"] },
    { id: "iyc", req: ["yes"], nm: "It's Yer Choice", wk: 2, role: "selfcontrol", steps: ["Hold a few treats in a closed fist at her nose level. Say nothing.", "Let her lick and paw. The moment she backs off, \"Yes!\" and give a treat from your other hand.", "Next, open your hand. If she dives, close it. If she waits, \"Yes!\" and treat.", "Build up to treats on the floor between your feet."], done: "She sits back and looks at you when she sees food in an open hand.", v: ["lm7KCqyL4Pk", "DBmLFn6YyoM"] },
    { id: "bowl", req: ["sit"], nm: "Wait at the food bowl", wk: 2, role: "selfcontrol", steps: ["Hold her bowl at waist height. Start lowering it.", "If she moves toward it, lift it straight back up.", "If you get it to your knee with her still, \"Yes!\" and give one piece. Start again.", "When the bowl reaches the floor and she's still, say \"Free!\" and let her eat."], done: "Bowl goes on the floor and she waits for \"Free!\".", v: ["yRMK1I6P0Zs"] },
    { id: "touch", req: ["yes"], nm: "Touch (hand target)", wk: 2, role: "recall", steps: ["Hold your flat hand a few centimetres from her nose.", "She sniffs it: \"Yes!\" and treat from the other hand.", "Move your hand left, right, lower. Add \"Touch\" when she's bopping it every time.", "Use it to steer her: off the couch, through a door, away from your ankles."], done: "She runs over to bop your hand from a metre away.", v: ["kGbYT5zMRVk"] },
    { id: "come", req: ["name"], nm: "Come", wk: 2, role: "recall", steps: ["Two people sit on the floor a few metres apart.", "Take turns: say her name and \"Come!\" happily, clap, lean back.", "Big party and a top treat when she arrives. Touch her collar as you treat.", "Move to different rooms, then the yard. Never call her for something bad."], done: "Runs straight to whoever calls, across the house.", v: ["J47GMmiew1I", "FvY1fYxKFJU"] },
    { id: "stay", req: ["sit"], nm: "Stay", wk: 3, role: "selfcontrol", steps: ["Ask for Sit. Say \"Stay\" with a flat palm.", "Count 1 second, \"Yes!\", treat while she's still sitting, then \"Free!\".", "Build time first: 2, 3, 5, 10 seconds.", "Then one step away and straight back. If she breaks, make it easier."], done: "Holds a 10-second Stay while you take one step away.", v: ["4wBApkKuEVI"] },
    { id: "leaveit", req: ["iyc"], nm: "Leave it", wk: 3, role: "selfcontrol", steps: ["Builds on It's Yer Choice.", "Put a boring treat on the floor under your hand. Say \"Leave it\".", "When she looks away or at you, \"Yes!\" and give a better treat from your hand.", "Later: uncovered treat, then a dropped sock, then a toy."], done: "Turns away from a treat on the floor when you say \"Leave it\".", v: ["Re66qOiso28", "GgOSk0Ayc2Q"] },
    { id: "drop", nm: "Drop it (trade game)", wk: 3, role: "selfcontrol", steps: ["Give her a so-so toy. Hold a great treat right at her nose.", "The moment she lets go, say \"Drop\", \"Yes!\" and treat.", "Give the toy straight back. She learns letting go doesn't mean losing it.", "Practise 5 times a session. Never chase her to get things back."], done: "She spits out a toy when anyone says \"Drop\".", v: ["gZvkyAFi7tc", "Xt-M1b0HcsU"] },
    { id: "settle", req: ["down"], nm: "Settle on a mat", wk: 3, role: "manners", steps: ["Put a towel down. Sit near it watching TV.", "Drop a treat between her paws whenever she lies on it.", "Reward slow, calm things: head down, a sigh, rolling onto a hip.", "Do it quietly. This is the off switch a busy-brained dog needs."], done: "She takes herself to the mat and flops when you sit down.", v: ["yr1olzgidMw", "wesm2OpE_2c"] },
    { id: "collar", req: ["name"], nm: "Collar grab game", wk: 3, role: "manners", steps: ["Touch her collar, treat. Repeat.", "Gently hold the collar for 1 second, treat.", "Build to a gentle hold for 3 seconds.", "This makes catching her in an emergency easy."], done: "She leans into your hand when you reach for her collar.", v: ["V8hDilz8Xl4"] },
    { id: "lead", req: ["sit"], nm: "Loose lead in the yard", wk: 4, role: "manners", steps: ["Clip the lead on, treat, take it off. Do it again later.", "In the yard, walk a few steps. Treat by your leg whenever she's next to you.", "If she pulls or bites the lead, stop still. Go again when it's loose.", "Keep it to a couple of minutes."], done: "Walks a lap of the yard with a loose lead.", v: ["VwOMIbtoWkk", "kCeock69ntQ"] },
    { id: "greet", req: ["sit"], nm: "Four paws to say hi", wk: 4, role: "all", steps: ["Visitor comes in. Ask for Sit.", "Visitor only bends down to pat while her bottom or four paws are on the ground.", "If she jumps, the visitor stands up and turns away.", "Practise with each of you coming in the front door."], done: "Sits when someone walks in, without being asked.", v: ["wghJ7xFotqY", "dsfOsZWtR_M"] },
    { id: "spin", req: ["sit"], nm: "Spin", wk: 4, role: "tricks", lure: "spin", steps: ["Hold a treat at her nose.", "Draw a wide circle at her nose height. She follows round.", "\"Yes!\" when she completes the circle.", "Add \"Spin\" when she's following smoothly. Teach the other way as \"Twist\"."], done: "Spins on the word with just a small finger circle.", v: ["8DHyOAvGwGw"] },
    { id: "findit", nm: "Find it (nose game)", wk: 5, role: "tricks", steps: ["Say \"Find it\" and drop a treat right by her nose.", "Then toss one a metre away. Then two.", "Hide treats in a rolled-up towel or under plastic cups.", "Pointer noses love this. It tires her out fast."], done: "She hunts out treats hidden around a room.", v: ["MJ_OjF5yU5s"] },
    { id: "hide", req: ["come"], nm: "Hide and seek", wk: 5, role: "all", steps: ["One person holds her, the other hides somewhere easy (behind a door, round a corner).", "The hider calls her name once, then \"Come!\" in a happy voice.", "The moment she finds you: party. \"Yes!\", a jackpot of treats, a game of tug.", "Swap roles. Make the hiding spots harder over days, never scary."], done: "She finds a hidden person in another room on one call, 4 times out of 5.", v: [] },
    { id: "shake", req: ["sit"], nm: "Shake", wk: 5, role: "tricks", steps: ["Ask for Sit. Hold a treat in a closed fist at her chest height.", "She'll paw at your fist. \"Yes!\" and open it.", "Then offer an open palm. \"Yes!\" when her paw lands.", "Add \"Shake\" once she's doing it every time."], done: "Gives a paw on cue to anyone.", v: ["8DHyOAvGwGw"] },
    { id: "roll", req: ["down"], nm: "Roll over", wk: 6, role: "tricks", lure: "roll", steps: ["Start in a Down.", "Move a treat from her nose to her shoulder. She flops onto her hip.", "Keep moving it over her shoulder blade. She rolls onto her back and over.", "\"Yes!\" as she finishes. Do it on carpet or grass, never hard floors."], done: "Rolls all the way over on the word.", v: ["8DHyOAvGwGw"] },
    { id: "bang", req: ["down"], nm: "Play dead (Bang!)", wk: 6, role: "tricks", steps: ["Start like Roll over, but stop when she's on her side.", "\"Yes!\" and treat while she's lying flat.", "Build up to holding it for 2 seconds.", "Add \"Bang!\" with a finger-gun. Then the drama is up to her."], done: "Flops on her side for \"Bang!\" and stays still for 2 seconds.", v: ["8DHyOAvGwGw"] }
  ],

  /* ---------- Help! Behaviour fixes. Biting first. ---------- */
  sos: {
    title: "She's biting right now",
    steps: [
      "Freeze. Hands still, arms folded. Moving hands are a game.",
      "Swap a toy into her mouth. Wiggle it along the floor so it's more fun than you.",
      "Still biting? Calm \"Uh-oh\", step behind the gate or door for 30 seconds, then come back calm.",
      "Third time in a few minutes? She's tired, not naughty. Toilet, then pen with a chew, and a nap."
    ]
  },
  biting: [
    { id: "why", nm: "Why she bites", tag: "Read first", body: [
        "Puppy biting is normal. Puppies explore and play with their mouths, and her baby teeth are needle-sharp.",
        "Herding dogs nip at moving feet. Gundogs are bred to carry things in their mouths. She's got both.",
        "It usually eases as her adult teeth come in, around 4 to 6 months. Your job now is to teach a soft mouth and give her better things to bite."],
      v: ["cMXTH8RvfaA", "6vrPDMc-I-k"] },
    { id: "tired", nm: "The over-tired, witching-hour puppy", tag: "Biggest cause", body: [
        "Most bad biting happens when she's tired, usually in the evening. The popular 18-to-20-hours figure is not well supported, but the pattern is: nap skipped, then shark.",
        "Rough guide: about 1 hour awake, then 1 to 2 hours asleep in her pen or crate with a chew.",
        "If the biting gets harder and she's zooming, don't play more. Toilet, then nap. Treat the pen as a nap spot, not a punishment."],
      do: ["Plan a nap before the evening chaos.", "Give a lick mat or stuffed chew toy in the pen to help her wind down."],
      v: ["eb9qNHCSbMI", "vhFGcfCihHs", "tC4kt1XWD3o"] },
    { id: "redirect", nm: "Redirect to toys", tag: "Everyday plan", body: [
        "Keep a tug toy in every room and in everyone's pocket.",
        "Teeth on skin: go still, offer the toy, play with the toy. Biting the toy = fun. Biting people = the fun stops.",
        "Long, floppy toys (a rope or fleece tug) keep teeth far from fingers."],
      dont: ["Don't push her face away with your hands. That's a game to her.", "Don't squeal and pull away. For lots of puppies that makes it more exciting."],
      v: ["c77--cCHPyU", "JRl1FhIBeKc", "6qslEs6hw5Q", "jGK3gF-mwyk", "_KYPJv4N1jE"] },
    { id: "ankles", nm: "Ankles, feet and trouser legs", tag: "Herding nips", body: [
        "This is the heading-dog chase instinct. Moving feet are like sheep to her.",
        "Before you walk across the room, scatter a few treats on the floor behind you or toss a toy ahead of her.",
        "A light house line (a thin lead with no handle, only while you're watching) lets you calmly stop the chase without grabbing her.",
        "Be a tree: stop walking, stand still, look away. Start again when she lets go."],
      v: ["zmAdRt9zoeA", "VsQz3cPZOEQ", "YGHDyCLy8GI"] },
    { id: "clothes", nm: "Sleeves, hair and clothes", tag: "", body: [
        "Hoodie strings, sleeves and long hair swinging around are irresistible.",
        "Tie hair back and tuck in strings for training sessions.",
        "If she grabs clothing, go still. She'll let go when it stops moving. Reward the moment she lets go, then give her a tug toy."],
      v: ["PwLfbkc8N24"] },
    { id: "kids", nm: "Biting the kids", tag: "Kids read this", body: [
        "Kids move fast and squeal, so they get bitten most. That's the puppy playing, not being mean.",
        "Sit on the floor with her, not standing up running around. Always have a toy between you and her.",
        "If she bites: arms folded, look at the ceiling, count to 5. Still biting? Walk calmly out of the room and shut the gate.",
        "No running away from her or chasing games. Throw a toy instead.",
        "Grown-up in the room for now. If a bite breaks the skin, tell a grown-up straight away."],
      v: ["8S2y77dIuCE", "hvrK8WXB3TI", "Y5Ji8TKbe7Y", "9cqfsdaUUYc"] },
    { id: "softmouth", nm: "Teaching a soft mouth", tag: "Bite inhibition", body: [
        "Before stopping mouthing completely, teach her how soft she has to be. Gentle mouthing is OK for now. Hard bites end the game.",
        "Over the next few weeks, end play for softer and softer bites too, until teeth on skin always stops play.",
        "A dog who learned a soft mouth as a puppy is much safer if she ever gets a fright as an adult."],
      v: ["6vrPDMc-I-k", "068K5Zlph9U", "aUgjDV_FIGU"] },
    { id: "pickup", nm: "Biting when picked up or brushed", tag: "", body: [
        "Many puppies bite when held because they feel trapped. Pick her up less, and use treats to make handling feel good.",
        "Feed a treat, touch, treat. Keep it short and stop before she wriggles.",
        "A lick mat smeared with a little puppy food keeps her mouth busy while you brush."],
      v: ["AoM9tis3t2c", "V8hDilz8Xl4"] },
    { id: "leadbite", nm: "Biting the lead", tag: "", body: [
        "Stop walking. Swap the lead for a tug toy, then go again.",
        "Keep early lead practice short and in the yard, and bring a toy to redirect onto."],
      v: ["AVnm5c3xCqs"] },
    { id: "plans", nm: "Full biting plans to watch", tag: "Longer videos", body: [
        "Pick one and watch it as a family, then agree on the same steps. Being consistent matters more than which method."],
      v: ["fbP0H0VliTY", "0R-ndQN3zEk", "G4IG5kEHb8g", "DwHk3o3P5cw", "WtXq5II3nNk", "O1mh9yGnCh0"] },
    { id: "dont", nm: "What not to do", tag: "Important", body: [
        "Don't hit, flick her nose, hold her mouth shut, scruff her, pin her down or \"alpha roll\" her. These scare puppies, and a scared puppy bites harder. The NZ SPCA and veterinary behaviourists advise against all of these.",
        "Don't spray water or shake a can of coins at her.",
        "Don't play tug-of-war with your hands or feet."],
      v: [] },
    { id: "help", nm: "When to get professional help", tag: "", body: [
        "Most puppies are much better by 5 to 6 months. Ask your vet or a reward-based trainer for help if:",
        "She growls with a stiff body, freezes, or stares hard before biting.",
        "She guards food, toys or her bed by growling or snapping.",
        "Biting is getting worse after 4 months, or bites are breaking skin often."],
      v: ["vBW7TQn3MYc"] }
  ],

  problems: [
    { id: "chewing", nm: "Chewing furniture and shoes", icon: "🦴", what: "She's teething and exploring. Chewing feels good on sore gums.",
      do: ["Put shoes, cables and kids' things away. Prevention is half of it.", "Give 3 or 4 legal chews and rotate them so they stay interesting.", "Wet a face cloth, twist it and freeze it: great for sore gums.", "Caught her chewing the couch? Swap in a chew and praise her when she takes it."],
      dont: ["Don't give cooked bones or hard antlers to a baby puppy."], v: ["Q0mDaHRSjTc", "UcO4coF990I", "lxHx1oOAElY", "l7lbIBTQT2Y"] },
    { id: "jumping", nm: "Jumping up", icon: "🦘", what: "She wants to get close to your face to say hi. It worked before, so she keeps trying.",
      do: ["Greet her only when she has four paws on the floor.", "If she jumps, stand up straight and turn away. Turn back when she's down.", "Toss a treat on the floor as you come in, so she's looking down, not up.", "Practise with visitors: Sit to say hi."],
      dont: ["Don't knee her or push her down. Pushing is attention too."], v: ["dsfOsZWtR_M", "yhxEZt9ZhEM", "wghJ7xFotqY"] },
    { id: "night", nm: "Crying in the crate or pen at night", icon: "🌙", what: "She's just left her littermates. Being alone at night is new and scary.",
      do: ["For the first nights, put her crate beside someone's bed so she can hear and smell you.", "A quiet toilet trip in the middle of the night is fine. Boring, no play.", "Feed meals in the crate and play crate games in the day so it's a good place.", "Move the crate slowly towards where you want it over a few weeks."],
      dont: ["Don't leave a 9-week-old to cry it out alone in another room."], v: ["J5iFsWfU2Zc", "l-buRWf3vqk", "wQq7PfXyQvY", "uso6tV2Rvqo", "m1fksWQlq7I"] },
    { id: "alone", nm: "Being left alone", icon: "🚪", what: "Puppies need to learn that being alone is safe. Start tiny now to prevent separation problems later.",
      do: ["Give her a chew in her pen and step out of sight for 10 seconds. Come back calmly.", "Build up slowly: 30 seconds, 1 minute, 5 minutes.", "Make leaving and coming back boring. No big goodbyes."],
      dont: [], v: ["HWT9DI7hMfo"] },
    { id: "toilet", nm: "Toilet accidents", icon: "🌿", what: "Her bladder is tiny. A rough rule is she can hold it for about her age in months plus one, in hours, during the day.",
      do: ["Take her out after every sleep, meal, play and training session, and at least every hour.", "Go to the same spot, stand still and wait. Praise and treat the moment she finishes.", "Accident? Clean it with an enzyme cleaner so the smell doesn't draw her back.", "Track toilet times for a few days to find her pattern."],
      dont: ["Don't rub her nose in it or tell her off. She'll just learn to hide from you to go."], v: ["a0daWXA2yTs", "nIXGaAMHvwM", "QvPiFcG7ROI", "pOKJxTKpFUQ"] },
    { id: "guarding", nm: "Growling over food or toys", icon: "🍖", what: "Guarding things is natural. You want her to learn that people near her bowl means more good stuff, not losing it.",
      do: ["Walk past her bowl while she eats and drop in something tastier, then walk away.", "Play the trade game: swap toys for treats, then give the toy back.", "If she has something dangerous, trade a high-value treat for it rather than grabbing."],
      dont: ["Don't take her food away to \"show who's boss\". It makes guarding worse.", "Growling is a warning. Never punish it. Back off and get advice if it happens."], v: ["2nyt2WLdQGs", "sMNup72dGyA", "vBW7TQn3MYc", "5IjEtgGHHM0"] },
    { id: "herding", nm: "Chasing and nipping the kids", icon: "🐑", what: "Heading-dog genes. Running kids look like sheep, and she'll try to round them up.",
      do: ["No chasing games. Throw a toy for her to chase instead.", "When kids are running around, she's in her pen with a chew, or on a lead with an adult.", "Reward her for lying calmly while the kids play."],
      dont: [], v: ["VsQz3cPZOEQ", "wQi7IDc8Gow", "9cqfsdaUUYc", "hvrK8WXB3TI"] },
    { id: "zoomies", nm: "Zoomies and over-excitement", icon: "🌀", what: "Short bursts of zooming are normal. Zoomies with hard biting usually means she's over-tired.",
      do: ["Let happy zoomies run out somewhere safe.", "Bitey zoomies: calmly pop her in her pen with a chew. Nap time.", "Teach the calm settle on a mat every day."],
      dont: ["Don't chase her. It turns zoomies into a game."], v: ["tC4kt1XWD3o", "yr1olzgidMw", "6O_jZmxKp3k", "ewFaK9ZUrME"] },
    { id: "barking", nm: "Barking or whining for attention", icon: "📢", what: "If barking ever gets her what she wants, she learns to bark more.",
      do: ["Wait for 2 seconds of quiet, then give her attention.", "Teach her what to do instead: sit or lie on her mat to get attention.", "Check her needs first: toilet, water, too tired, bored."],
      dont: ["Don't shout at her. To her, you're barking too."], v: ["5e_gVqJkdek", "wlDQ_mAbCyA", "aNyVYDaMZ9s", "rK3jdtvBoqk"] },
    { id: "stealing", nm: "Stealing socks and running off", icon: "🧦", what: "Grab-and-run is a brilliant game: she gets something and everyone chases her.",
      do: ["Don't chase. Walk the other way, or rattle the treat jar.", "Trade: a great treat for the sock, then praise.", "Teach Drop and Leave it every day.", "Put tempting things away."],
      dont: ["Don't chase her round the house. That's the game she wants."], v: ["gZvkyAFi7tc", "Xt-M1b0HcsU", "GgOSk0Ayc2Q", "8yRmv81FvnA"] },
    { id: "pulling", nm: "Pulling on the lead", icon: "🦮", what: "Puppies pull because pulling gets them where they want to go.",
      do: ["Start in the yard. Treat her every few steps when she's beside you.", "If the lead goes tight, stop. Move again when it's loose.", "Short sessions, lots of treats. Bring a toy for lead biting."],
      dont: ["No yanking, choke chains or prong collars."], v: ["kCeock69ntQ", "WVYJVAi1bW0", "s-TbyNUjyQg", "VwOMIbtoWkk"] },
    { id: "prey", nm: "Chasing cats and birds", icon: "🐦", what: "Pointer genes. She's built to find and lock onto birds, and to chase things that run.",
      do: ["Keep her on a lead or behind a gate around cats and chooks while she learns.", "Reward her for looking at the cat, then looking back at you.", "Play It's Yer Choice and Leave it every day. Self-control is a muscle."],
      dont: ["Never let her practise chasing, even once. Chasing feels great and becomes a habit."], v: ["vHrHBZIA5h4", "JV9OBvnzmmI", "h9Q6uRBDscw", "DBmLFn6YyoM"] },
    { id: "fear", nm: "Scared of new things", icon: "🫣", what: "This is her socialisation window. Gentle, happy experiences now prevent fear later.",
      do: ["Let her watch new things from a distance and come closer when she's ready.", "Pair every new thing with treats.", "If she backs away, move further away. Never drag or push her towards it."],
      dont: ["Don't force her to \"face her fears\"."], v: ["ZQg2UzPHJDE", "8BMhFYpxkHk", "_P4H3hX-j28", "x2JLQloTN3o"] },
    { id: "vet", nm: "Vet checks, nails and brushing", icon: "🩺", what: "Being handled is a skill she needs to learn, and it's much easier when she's small.",
      do: ["Touch, treat, touch, treat. Paws, ears, mouth, tail.", "Teach a chin rest on your hand so she can choose to take part.", "Trim one nail, then lots of treats. Stop there for the day."],
      dont: ["Don't hold her down for a full nail trim yet."], v: ["AoM9tis3t2c", "h9DMT0E83Q4", "V8hDilz8Xl4", "_KfrxgaT6N8"] },
    { id: "escape", nm: "Escaping the gate or pen", icon: "🔓", what: "Smart puppies work out latches. She'll keep trying if it worked once.",
      do: ["Clip the latch with a carabiner or cable tie.", "Give her a chew or stuffed toy every time she goes in the pen, so she wants to stay.", "Practise short pen stays when she's sleepy."],
      dont: [], v: ["uso6tV2Rvqo"] },
    { id: "bored", nm: "Bored brain, busy dog", icon: "🧩", what: "Gundog and heading dog brains need jobs. Ten minutes of sniffing and thinking tires her more than a long walk.",
      do: ["Feed one meal a day from a snuffle mat, puzzle or scatter on the grass.", "Play Find it with part of her dinner.", "Cardboard box with treats and scrunched paper inside (supervised).", "Teach one new trick a week."],
      dont: [], v: ["Hxd1sVEQp2Y", "LPimyV4b0kA", "KBL2NeSruh0", "MJ_OjF5yU5s", "FVUAb91BmPg"] }
  ],

  /* ---------- Famous trainers ---------- */
  trainers: [
    { name: "Kikopup (Emily Larlham)", url: "https://www.youtube.com/@kikopup", style: "reward", line: "Step-by-step reward-based games. Brilliant for tricks and puppy problems.", v: ["c77--cCHPyU", "PwLfbkc8N24"] },
    { name: "McCann Dog Training", url: "https://www.youtube.com/@McCannDogs", style: "mixed", line: "Big Canadian puppy school. Puppy videos are mostly reward-based. They use collar and lead pressure with some older dogs.", v: ["0R-ndQN3zEk", "G4IG5kEHb8g"] },
    { name: "Zak George", url: "https://www.youtube.com/@zakgeorge", style: "reward", line: "Upbeat YouTube trainer, no punishment. Great for kids to watch.", v: ["JRl1FhIBeKc", "AVnm5c3xCqs"] },
    { name: "Victoria Stilwell (It's Me or the Dog)", url: "https://www.youtube.com/@ItsMeortheDog", style: "reward", line: "TV trainer and strong voice for positive training over dominance methods.", v: ["DwHk3o3P5cw", "Y5Ji8TKbe7Y"] },
    { name: "Susan Garrett (Dogs That)", url: "https://www.youtube.com/@DogsThat", style: "reward", line: "World champion agility trainer. Game-based training, crate games and impulse control.", v: ["6qslEs6hw5Q", "cMXTH8RvfaA"] },
    { name: "Dr Ian Dunbar (Dog Star Daily)", url: "https://www.youtube.com/@DogStarDaily", style: "reward", line: "Vet and behaviourist who pioneered puppy classes and bite inhibition training.", v: ["6vrPDMc-I-k"] },
    { name: "Jo-Rosie Haffenden", url: "https://www.youtube.com/@jo-rosiehaffenden543", style: "reward", line: "UK behaviourist from TV's Sit Baby Sit. Science-based and reward-based.", v: ["aUgjDV_FIGU", "eSgcioJD5Xc"] },
    { name: "Dogs Trust", url: "https://www.youtube.com/@dogstrust", style: "reward", line: "UK's biggest dog charity. Short, family-friendly puppy guides.", v: ["ioZMPd3cX2o", "m1fksWQlq7I"] },
    { name: "Battersea Dogs and Cats Home", url: "https://www.youtube.com/@batterseadogsandcats", style: "reward", line: "UK rescue charity with short, reward-based advice videos.", v: ["WtXq5II3nNk", "nIXGaAMHvwM"] },
    { name: "SPCA New Zealand", url: "https://www.youtube.com/@spcanz", style: "reward", line: "NZ's animal welfare charity. Force-free training. Kids' education video below.", v: ["3x_H4kElBy8"] },
    { name: "Doggy Dan (The Online Dog Trainer)", url: "https://www.youtube.com/@TheOnlineDogTrainer-DoggyDan", style: "mixed", line: "Kiwi trainer. Gentle and non-physical, but uses \"pack leader\" ideas that behaviour vets now consider outdated.", v: ["D-YxwQcC4xg"] },
    { name: "Will Atherton", url: "https://www.youtube.com/@willathertoncaninetraining", style: "mixed", line: "Popular UK trainer. Mostly reward and engagement, plus slip-lead pressure and firm verbal interrupters.", v: ["O1mh9yGnCh0", "s-TbyNUjyQg"] },
    { name: "Graeme Hall (Dogs Behaving Very Badly)", url: "https://www.youtube.com/@DogsBehavingVeryBadly", style: "mixed", line: "UK TV's \"Dogfather\". Calm leadership and rewards; some techniques on the show have been criticised by welfare groups.", v: ["UOU4trSbl5s"] },
    { name: "Cesar Millan (The Dog Whisperer)", url: "https://www.youtube.com/@CesarMillanOfficial", style: "aversive", line: "The most famous TV dog trainer. Good points on calm energy, routine and exercise. His shows also use physical corrections, pokes, leash pops and pinning, based on dominance ideas.",
      note: "Take the calm-energy and exercise ideas. Skip the pokes, leash pops and pinning, especially with a biting puppy and kids doing the training: punishment can make a puppy more fearful and bitey. The NZ SPCA and veterinary behaviourists advise reward-based methods instead (links in Reading).",
      v: ["3Odb0BAjZxA", "CKPUs_1KZ0o", "ax_j0OQYXBE"] },
    { name: "Tom Davis", url: "https://www.youtube.com/@tomdavisofficial", style: "aversive", line: "US \"balanced\" trainer who promotes e-collars. His puppy videos are mostly food and lead work. Toilet training video is useful.", v: ["a0daWXA2yTs"] },
    { name: "Larry Krohn", url: "https://www.youtube.com/@Larrykrohn", style: "aversive", line: "US \"balanced\" trainer known for e-collar training. Short feeding-time puppy tips.", v: ["ouMHMVepuY0"] },
    { name: "Stonnie Dennis", url: "https://www.youtube.com/@StonnieDennis", style: "aversive", line: "US gundog and Labrador trainer. Uses e-collars with older dogs. Long, detailed puppy series.", v: ["kEZx2X46L7s"] }
  ],

  /* ---------- Starter playlists ---------- */
  watch: [
    { h: "Start here: watch as a family", v: ["-XMBDQGOrpY", "3JgcvlKaxzc", "ckWzAqJEhKg", "kGbYT5zMRVk", "ioZMPd3cX2o"] },
    { h: "Biting: the 10-minute crash course", v: ["cMXTH8RvfaA", "6vrPDMc-I-k", "jGK3gF-mwyk", "_KYPJv4N1jE", "zmAdRt9zoeA", "c77--cCHPyU"] },
    { h: "The plan by age", v: ["hpb7-dbjVSU", "zt3AVydlc2g"] },
    { h: "Everyday skills", v: ["wqoYc4VZCOg", "J47GMmiew1I", "FvY1fYxKFJU", "lm7KCqyL4Pk", "yRMK1I6P0Zs", "Re66qOiso28", "4wBApkKuEVI", "4SjwxgcsFwo"] },
    { h: "Tricks", v: ["8DHyOAvGwGw"] },
    { h: "Deep dive", v: ["4dbzPoB7AKk"] }
  ],

  reading: [
    ["Puppy biting: causes and how to stop it safely (Dogs Trust)", "https://www.dogstrust.org.uk/dog-advice/unwanted-behaviours/stop-your-dog-chewing-mouthing"],
    ["Bringing your new puppy home (SPCA NZ)", "https://www.spca.nz/advice-and-welfare/article/bringing-your-new-dog-or-puppy-home"],
    ["Dog behaviour and training (SPCA NZ)", "https://www.spca.nz/advice-and-welfare/article/dog-behaviour-and-training"],
    ["Training methods and devices: position statement (SPCA NZ)", "https://www.spca.nz/advocacy/position-statements/article/training-methods-and-devices"],
    ["Humane dog training position statement (AVSAB, PDF)", "https://avsab.org/wp-content/uploads/2024/12/AVSAB-Humane-Dog-Training-Position-Statement-2021.pdf"],
    ["Dominance theory and dogs (AVSAB, PDF)", "https://avsab.org/wp-content/uploads/2024/12/Dominance_Position_Statement-download.pdf"],
    ["Socialising puppies before vaccinations finish (AVSAB, PDF)", "https://avsab.org/wp-content/uploads/2024/12/Puppy-Socialization-Position-Statement-FINAL.pdf"],
    ["How to teach your dog to stay (AKC)", "https://www.akc.org/expert-advice/training/best-way-teach-dog-stay/"],
    ["How to teach a dog to come (PetMD)", "https://www.petmd.com/dog/training/how-teach-your-dog-come-when-called"],
    ["Puppy preschool (Animates NZ)", "https://www.animates.co.nz/services/puppy-school/"]
  ],

  /* ---------- Video library: id -> details ---------- */
  videos: {
    "ckWzAqJEhKg": ["Your complete first week puppy training plan", "McCann Dog Training"],
    "hpb7-dbjVSU": ["Your complete puppy training schedule by age", "McCann Dog Training"],
    "3JgcvlKaxzc": ["You're missing the point of your family puppy training plan", "McCann Dog Training"],
    "-XMBDQGOrpY": ["28 puppy training tips in 8 minutes", "McCann Dog Training", 8],
    "zt3AVydlc2g": ["New puppy survival guide: the first 24 hours", "Zak George"],
    "kGbYT5zMRVk": ["The first things to teach your new puppy", "Zak George"],
    "J47GMmiew1I": ["Train your dog to come no matter what", "Zak George"],
    "4wBApkKuEVI": ["Calm down and stay", "Zak George"],
    "4SjwxgcsFwo": ["Listening when distracted", "Zak George"],
    "FvY1fYxKFJU": ["Train your puppy to come when called", "Zak George"],
    "wqoYc4VZCOg": ["Teach your puppy his name", "Kikopup"],
    "Re66qOiso28": ["Train your dog or puppy Leave It", "Kikopup"],
    "wesm2OpE_2c": ["Capturing calmness", "Kikopup"],
    "4dbzPoB7AKk": ["Puppy training tutorials (long reference)", "Kikopup"],
    "lm7KCqyL4Pk": ["It's Yer Choice: impulse control game", "Ellie's Dog Behaviour Vault"],
    "yRMK1I6P0Zs": ["Teach your dog to wait for the food bowl", "Vetstreet"],
    "fbP0H0VliTY": ["Stop puppy biting fast: everything you need to know", "McCann Dog Training"],
    "eb9qNHCSbMI": ["The calming technique to stop puppy biting", "McCann Dog Training"],
    "8DHyOAvGwGw": ["Roll over, play dead, sit, lie down", "Zak George"],
    "jGK3gF-mwyk": ["This common biting \"fix\" is just a game to them", "McCann Dog Training", 1, "shorts"],
    "_KYPJv4N1jE": ["Why your puppy still bites you", "McCann Dog Training", 1, "shorts"],
    "zmAdRt9zoeA": ["Stop puppy toe biting fast (use a house line)", "McCann Dog Training", 1, "shorts"],
    "c77--cCHPyU": ["Stop your puppy biting and mouthing", "Kikopup", 9],
    "PwLfbkc8N24": ["Stop puppy biting clothes", "Kikopup", 7],
    "8S2y77dIuCE": ["How to stop a puppy biting kids", "Zak George"],
    "vhFGcfCihHs": ["Stop the witching hour with calmness training", "absoluteDogs"],
    "068K5Zlph9U": ["Bite inhibition training", "Simpawtico Dog Training"],
    "Q0mDaHRSjTc": ["Pick the right chew toy for your puppy", "McCann Dog Training"],
    "UcO4coF990I": ["What your teething puppy should chew", "The Puppy Academy", 1, "shorts"],
    "lxHx1oOAElY": ["Stop your puppy chewing the furniture", "The Puppy Academy", 1, "shorts"],
    "l7lbIBTQT2Y": ["Stop your puppy destroying your property", "Zak George"],
    "dsfOsZWtR_M": ["How to stop your dog jumping up", "McCann Dog Training"],
    "yhxEZt9ZhEM": ["Stop your puppy jumping on guests", "McCann Dog Training"],
    "wghJ7xFotqY": ["Polite greetings: stop jumping", "Kikopup"],
    "l-buRWf3vqk": ["This trick makes crate training at night easier", "McCann Dog Training", 1, "shorts"],
    "J5iFsWfU2Zc": ["The nightstand trick for crate training", "McCann Dog Training", 1, "shorts"],
    "wQq7PfXyQvY": ["Stop your dog whining in the crate", "McCann Dog Training"],
    "uso6tV2Rvqo": ["Susan Garrett's Crate Games", "Dogs That"],
    "HWT9DI7hMfo": ["Separation training for puppies", "Kikopup"],
    "a0daWXA2yTs": ["I potty trained 1,000+ dogs: what always works", "Tom Davis Dog Training"],
    "nIXGaAMHvwM": ["Toilet training your puppy: the Battersea way", "Battersea Dogs and Cats Home"],
    "QvPiFcG7ROI": ["House training a puppy", "Kikopup"],
    "pOKJxTKpFUQ": ["Teach your puppy to tell you they need to go out", "Dogs That"],
    "2nyt2WLdQGs": ["Preventing toy guarding: a trade game", "Kikopup"],
    "sMNup72dGyA": ["Preventing resource guarding: Drop", "Kikopup"],
    "vBW7TQn3MYc": ["Growling over food or toys? Stop it before it gets worse", "Dr. Lisa Radosta (vet behaviourist)"],
    "5IjEtgGHHM0": ["How to stop resource guarding", "Zak George"],
    "VsQz3cPZOEQ": ["Stop biting legs", "Kikopup"],
    "YGHDyCLy8GI": ["Stop your puppy biting your legs when you move", "Kikopup", 1, "shorts"],
    "wQi7IDc8Gow": ["Herding breeds: avoiding ankle bites on kids", "Rescue Dogs 101"],
    "9cqfsdaUUYc": ["The secret to calm dogs around wild kids", "McCann Dogs Clips"],
    "hvrK8WXB3TI": ["Stop chasing your puppy (do this instead)", "McCann Dog Training", 1, "shorts"],
    "yr1olzgidMw": ["The calm settle", "Kikopup"],
    "6O_jZmxKp3k": ["The secret to a calm puppy \"place\"", "McCann Dog Training", 1, "shorts"],
    "tC4kt1XWD3o": ["Good zoomies vs bad zoomies", "The Puppy Academy", 1, "shorts"],
    "ewFaK9ZUrME": ["Karen Overall's relaxation protocol, days 1 to 5", "The Kind Canine"],
    "5e_gVqJkdek": ["The attention noise", "Kikopup"],
    "wlDQ_mAbCyA": ["Stop doing this when your dog wants attention", "Zak George", 1, "shorts"],
    "aNyVYDaMZ9s": ["Why ignoring attention-seeking doesn't work", "Royal Pups Training", 1, "shorts"],
    "rK3jdtvBoqk": ["My puppy barks at night", "McCann Dog Training"],
    "gZvkyAFi7tc": ["How to train Drop It", "Kikopup"],
    "Xt-M1b0HcsU": ["Teach your dog to drop things fast", "McCann Dog Training", 1, "shorts"],
    "GgOSk0Ayc2Q": ["How to teach Leave It in 1 minute", "Zak George", 1, "shorts"],
    "8yRmv81FvnA": ["Teach puppy to leave a sock on the ground", "Diamond Dog Training", 1, "shorts"],
    "kCeock69ntQ": ["Do this before you start leash walking", "McCann Dog Training", 1, "shorts"],
    "WVYJVAi1bW0": ["5 mistakes teaching a puppy to walk on lead", "McCann Dog Training"],
    "s-TbyNUjyQg": ["Teach your puppy loose lead walking", "Will Atherton Canine Training"],
    "VwOMIbtoWkk": ["Stop lead walking problems before they start", "Kikopup"],
    "vHrHBZIA5h4": ["Train your dog to leave your cat alone", "Zak George"],
    "JV9OBvnzmmI": ["Introducing your new puppy to your cat", "Blue Cross UK"],
    "h9Q6uRBDscw": ["How to introduce your puppy to your cat", "The Puppy Academy", 1, "shorts"],
    "DBmLFn6YyoM": ["It's Yer Choice: a dog impulse control game", "K9 of Mine"],
    "ZQg2UzPHJDE": ["Socialising puppies to surfaces and sounds", "Kikopup"],
    "8BMhFYpxkHk": ["Socialisation to different surfaces", "Kikopup"],
    "_P4H3hX-j28": ["Puppy socialisation: new sounds and places", "McCann Dogs Clips"],
    "x2JLQloTN3o": ["Helping dogs grow confidence without flooding", "Dogs That"],
    "AoM9tis3t2c": ["Handling and grooming for puppies", "Kikopup"],
    "h9DMT0E83Q4": ["Puppy nail trimming: start paw handling early", "McCann Dogs Clips"],
    "V8hDilz8Xl4": ["Your puppy needs this handling exercise", "McCann Dogs Clips"],
    "_KfrxgaT6N8": ["Chin rest tutorial for cooperative care", "Lucie's Pooches"],
    "Hxd1sVEQp2Y": ["Susan Garrett's 5 games for puppies", "Dogs That"],
    "LPimyV4b0kA": ["5 brain games for a rainy day", "absoluteDogs"],
    "KBL2NeSruh0": ["Snuffle mats: canine enrichment", "K9 of Mine", 1, "shorts"],
    "MJ_OjF5yU5s": ["How to teach your dog to play Find It", "Winnipeg Humane Society"],
    "FVUAb91BmPg": ["DIY brain games: homemade food puzzles", "Everything Dog"],
    "3Odb0BAjZxA": ["How to stop puppy biting and chewing", "Cesar Millan", 3],
    "CKPUs_1KZ0o": ["How to introduce yourself to a puppy", "Cesar Millan", 8],
    "ax_j0OQYXBE": ["How to stop puppy biting (Cesar 911, a pointer-type puppy)", "Cesar Millan", 13],
    "DwHk3o3P5cw": ["Puppy mouthing", "Victoria Stilwell (eHowPets)", 4],
    "Y5Ji8TKbe7Y": ["Puppy who bites his owner constantly", "It's Me or the Dog", 4],
    "JRl1FhIBeKc": ["How to train your puppy to stop biting", "Zak George", 7],
    "AVnm5c3xCqs": ["How to stop puppy biting on a lead", "Zak George", 5],
    "0R-ndQN3zEk": ["Stop puppy biting with a different approach", "McCann Dog Training", 10],
    "G4IG5kEHb8g": ["The missing piece in your puppy biting training", "McCann Dog Training", 12],
    "6qslEs6hw5Q": ["How to stop puppy biting", "Susan Garrett (Dogs That)", 6],
    "cMXTH8RvfaA": ["Why do puppies bite?", "Susan Garrett (Dogs That)", 4],
    "6vrPDMc-I-k": ["Teaching bite inhibition", "Dr Ian Dunbar (Dog Star Daily)", 2],
    "D-YxwQcC4xg": ["Puppy training overview", "Doggy Dan", 5],
    "O1mh9yGnCh0": ["How to stop puppy biting", "Will Atherton Canine Training", 5],
    "UOU4trSbl5s": ["Getting a puppy?", "Dogs Behaving Very Badly", 2],
    "aUgjDV_FIGU": ["Mouthing and biting 101", "Jo-Rosie Haffenden", 7],
    "eSgcioJD5Xc": ["Clicker training puppy 101", "Jo-Rosie Haffenden", 4],
    "ioZMPd3cX2o": ["Day one with a new puppy", "Dogs Trust", 3],
    "m1fksWQlq7I": ["First nights with a new puppy", "Dogs Trust", 2],
    "WtXq5II3nNk": ["How to stop your puppy mouthing", "Battersea Dogs and Cats Home", 3],
    "3x_H4kElBy8": ["Dog and puppy care for kids", "SPCA NZ Education", 10],
    "ouMHMVepuY0": ["Using feeding time to train puppies", "Larry Krohn", 1],
    "kEZx2X46L7s": ["Common sense puppy training, part one", "Stonnie Dennis", 17]
  },

  /* ---------- rewards: levels, badges, points (see docs/REWARDS.md) ---------- */
  kinds: { kid: { name: "Kid", target: 21 }, adult: { name: "Grown-up", target: 10 } },
  slotWindows: { am: [5.5, 12], pm: [12, 17.5], ev: [17.5, 22] },
  points: { session: 10, sessionOther: 8, fullDay: 5, mastery: 30, witness: 10, bite: 2, toilet: 2, toiletCap: 10, packDay: 5, social: 5 },
  puppyPoints: { session: 10, mastery: 50, calmDay: 20, packDay: 10, toilet: 2, toiletCap: 10, social: 10 },
  levels: [["New Recruit", 0], ["Treat Pocket", 50], ["Clicker Cadet", 150], ["Sit Specialist", 300], ["Lead Hand", 500], ["Bite Buster", 800], ["Recall Ranger", 1200], ["Pack Captain", 1700], ["Top Dog Trainer", 2400], ["Puppy School Principal", 3500]],
  puppyLevels: [["Land Shark", 0], ["Treat Seeker", 100], ["Name Knower", 250], ["Sitter", 450], ["Settler", 700], ["Good Walker", 1000], ["Recall Rookie", 1400], ["Soft Mouth", 1900], ["Clever Clogs", 2500], ["Good Dog Graduate", 3200]],
  masteryVotes: 3,
  badges: [
    { id: "first", g: "Showing up", e: "🍖", icon: "bone", nm: "First Treat", how: "Your first session logged." },
    { id: "hattrick", g: "Showing up", e: "🎩", icon: "trophy", nm: "Hat-trick", how: "All three slots in one day." },
    { id: "early", g: "Showing up", e: "🌅", icon: "sunrise", nm: "Early Bird", how: "Five morning sessions ticked before 7:30am." },
    { id: "owl", g: "Showing up", e: "🦉", icon: "moon", nm: "Night Owl", how: "Five evening sessions after 7pm." },
    { id: "s7", g: "Streaks", e: "🔥", icon: "flame", nm: "Seven Sleeps", how: "A 7-day streak." },
    { id: "s14", g: "Streaks", e: "🔥", icon: "flame", nm: "Fortnight Fur", how: "A 14-day streak." },
    { id: "s30", g: "Streaks", e: "🌙", icon: "moon", nm: "Moon Dog", how: "A 30-day streak." },
    { id: "perfect", g: "Streaks", e: "💯", icon: "star", nm: "Perfect Week", how: "Every session, Monday to Sunday." },
    { id: "frozen", g: "Streaks", e: "🧊", icon: "snow", nm: "Frozen Bone", how: "Used a streak freeze and came back the next day." },
    { id: "comeback", g: "Streaks", e: "🪃", icon: "refresh", nm: "Comeback Kid", how: "Lost a streak, then built a 7-day one again." },
    { id: "sk_name", g: "Skills", e: "📣", icon: "target", nm: "Name Game", how: "Confirmed the Name game goal." },
    { id: "sk_sit", g: "Skills", e: "🪑", icon: "target", nm: "Bum Down", how: "Confirmed the Sit goal." },
    { id: "sk_down", g: "Skills", e: "🕵️", icon: "target", nm: "Lie Detector", how: "Confirmed the Down goal." },
    { id: "sk_stay", g: "Skills", e: "🗿", icon: "target", nm: "Stay Put", how: "Confirmed the Stay goal." },
    { id: "sk_come", g: "Skills", e: "🪃", icon: "target", nm: "Boomerang", how: "Confirmed the Come goal." },
    { id: "sk_leaveit", g: "Skills", e: "🙅", icon: "target", nm: "Leave It Legend", how: "Confirmed the Leave it goal." },
    { id: "sk_lead", g: "Skills", e: "🦮", icon: "target", nm: "Loose Lead Louie", how: "Confirmed the loose lead goal." },
    { id: "sk_trick", g: "Skills", e: "🎪", icon: "spark", nm: "Showstopper", how: "Confirmed Roll over or Play dead." },
    { id: "half", g: "Skills", e: "📗", icon: "grad", nm: "Half the Syllabus", how: "You've confirmed half of all the skills." },
    { id: "full", g: "Skills", e: "🎓", icon: "grad", nm: "Full Syllabus", how: "Every skill mastered. Whole pack badge." , pack: true },
    { id: "reporter", g: "Biting", e: "📝", icon: "pen", nm: "Bite Reporter", how: "Rated the bite meter on 10 days." },
    { id: "softsun", g: "Biting", e: "🛋️", icon: "heart", nm: "Soft Mouth Sunday", how: "A calm day (Angel or Gentle) on a weekend.", pack: true },
    { id: "calm3", g: "Biting", e: "🧘", icon: "heart", nm: "Three Calm Days", how: "Three calm days in a row. Whole pack badge.", pack: true },
    { id: "shark", g: "Biting", e: "🦈", icon: "shield", nm: "Shark Tamer", how: "A week averaging Gentle or better. Whole pack badge.", pack: true },
    { id: "toilet20", g: "Toilet", e: "🚽", icon: "drop", nm: "Toilet Tracker", how: "Logged 20 toilet trips." },
    { id: "dryday", g: "Toilet", e: "☀️", icon: "sun", nm: "Dry Day", how: "A day with outside trips and no accidents. Whole pack badge.", pack: true },
    { id: "social10", g: "Socialising", e: "🌏", icon: "globe", nm: "Out and About", how: "Ten socialisation items ticked happy." },
    { id: "social40", g: "Socialising", e: "🦋", icon: "globe", nm: "Social Butterfly", how: "Forty socialisation items ticked happy. Whole pack badge.", pack: true },
    { id: "pack7", g: "Teamwork", e: "🐾", icon: "paw", nm: "Whole Pack", how: "Seven days where everyone trained. Whole pack badge.", pack: true },
    { id: "principal", g: "Teamwork", e: "🏫", icon: "crown", nm: "Puppy School Principal", how: "Reached level 10." }
  ],
  toiletKinds: [["wee", "Wee"], ["poo", "Poo"], ["accident", "Accident inside"]],
  toiletBefore: [["woke", "Just woke up"], ["ate", "After eating"], ["played", "After play"], ["other", "Other"]],
  toiletInterval: [[14, 60], [22, 90], [30, 180], [99, 240]],

  /* ---------- nudges: puppy-voiced, no guilt, rotated so nobody sees the same line twice in a week ---------- */
  nudges: {
    am: [
      "{pup}'s awake and has opinions. 5 minutes of {skill} before school?",
      "Morning, {name}. {pup} would like to open the day with {skill}.",
      "Treat pouch check. {pup} says now would be good for {skill}.",
      "{pup} slept well and is ready to be a genius. {skill}, 5 minutes?"
    ],
    pm: [
      "Afternoon slot's empty, {name}. {pup} has been practising {her} sad eyes.",
      "Bag down, treats out: {skill} with {pup} before the zoomies start.",
      "{pup} says the afternoon is for {skill}. Two minutes counts.",
      "Rain or shine, {skill} works in the hall. {pup}'s ready when you are."
    ],
    ev: [
      "One more before bed? {pup} picked {skill}, and a calm puppy sleeps better.",
      "Evening slot's open, {name}. A short {skill} session, then a chew and bed for {pup}.",
      "{pup} would like to end the day on a win. {skill}, then lights out."
    ],
    sms: [
      "{pup} here. Nothing on the chart from you yet today, {name}. Your mission: {skill}. 5 minutes is plenty. puppy.appspurt.com",
      "Hi {name}, it's {pup}. Your afternoon mission is {skill}. Tap it off when you're done. puppy.appspurt.com"
    ],
    risk: "No sessions yet today, {name}. One 5-minute go keeps your {streak}-day streak. No stress if not, you've got a freeze.",
    exitTitle: "Reminders are having a rest",
    exit: "{pup}'s reminders are having a rest. Open Settings to turn them back on whenever you like."
  },

  /* ---------- kids and the puppy: the safety module (Reisner 2007, Family Paws, Doggone Safe, Lili Chin) ---------- */
  kids: {
    intro: "Most bites to kids happen with a grown-up right there, over food, during a hug, or to a sleeping dog. These are the rules in our house, and the games that keep everyone safe.",
    rules: [
      "Food and chews are hers. Never go near her while she eats or chews, and never take something off her. Call a grown-up.",
      "A resting dog is left alone. No waking her, no climbing into the crate, no hugging a sleeping puppy.",
      "No hugs, no face-to-face, no leaning over her. Pat her chest or side, from beside her.",
      "No running, chasing or shrieking games around her. If you want to play tag, she goes in her pen with a chew first.",
      "If she walks away, the game is over. Never follow, grab or hold a puppy who is leaving.",
      "A grown-up is in the room, watching, every time. Not just nearby.",
      "Anything that might scare or hurt her (nails, bath, taking something from her mouth, the vet) is a grown-up's job."
    ],
    consent: { nm: "Pat, Pet, Pause: does she want a cuddle?", steps: ["Pat your leg and wait. Don't reach for her. If she comes over, go to step 2. If she doesn't, that's her answer.", "Pet for three seconds, chest or side, one hand.", "Pause. Take your hand away. If she leans in or nudges, pet again. If she turns away, yawns, walks off or goes stiff, stop."], why: "Score it: did she say yes? Three seconds then a pause also stops petting from winding her up into mouthing." },
    tree: { nm: "Be a Tree: when she's jumping and nipping", steps: ["Stop. Stand still.", "Fold your branches: arms in, hands clasped at your front.", "Watch your roots: look at your feet, not at her.", "Count your breaths until she gets bored or a grown-up calls her away."], why: "Trees are boring. Running, squealing and flapping are the best game she has ever seen." },
    signals: {
      green: ["Loose, wiggly body", "Soft eyes, mouth open and soft", "Play bow", "Leaning in", "Comes back for more"],
      amber: ["Yawning when she's not tired", "Licking her lips with no food around", "Turning her head away", "Whites of her eyes showing", "One paw lifted", "A shake-off like she's wet", "Suddenly sniffing the ground", "Ears pinned back"],
      red: ["Body stiff or frozen", "Hard stare", "Closed mouth, lips pulled back", "Growl", "Hackles up", "Tail tucked, hiding", "Snap"]
    },
    signalsNote: "Green: keep going. Amber: she's unsure, give her space and the point goes to whoever spotted it. Red: stop now, a grown-up takes over. A growl is a warning she's kind enough to give; never punish it.",
    ages: [
      ["5 to 9", "Mark-and-treat games for skills she knows, treat tossing, find-it, hand-feeding from a flat hand, scatter feeding, spotting signals, filling a Kong with help.", "Walking her on lead, picking her up, the trade game alone, tug (she wins the arm)."],
      ["10 to 11", "All of that, plus luring new tricks, two-person recall, loose-lead in the yard, It's Yer Choice with a grown-up watching, feeding meals (grown-up stands by).", "The lead near roads, anything with a growl, interrupting her with a stolen thing."],
      ["12 to 14", "Lead walks on quiet streets once she walks nicely, stay and recall with distractions, running her nap and enrichment schedule, leading a session for younger siblings.", "Being the only person in charge of her around younger kids, visitors' dogs, off-lead in public."]
    ],
    bite: "If she bites you: freeze, go quiet, put a toy in her mouth or step away. No squealing. Squealing kids are the most exciting thing a herding puppy has ever heard."
  },

  /* ---------- weekly challenges: one at a time, puppy-voiced, the family wins together ---------- */
  challenges: [
    { id: "early", nm: "Early Birds", e: "🌅", icon: "sunrise", ask: "I'm sharpest in the morning. Give me 12 before-8am sessions this week.", target: 12 },
    { id: "fullhouse", nm: "Full House", e: "🎩", icon: "trophy", ask: "Everyone gets one hat-trick day (all three slots) this week.", target: 0 },
    { id: "diary", nm: "Bite Diary", e: "📝", icon: "pen", ask: "Rate my bitey-ness every single day this week, so you can see me improving.", target: 7 },
    { id: "quiet", nm: "Quiet Mouth", e: "🧘", icon: "heart", ask: "Average Gentle or better across at least five rated days.", target: 5 },
    { id: "nofreeze", nm: "Zero Freeze", e: "🧊", icon: "snow", ask: "Nobody needs a streak freeze all week. Seven clean days.", target: 7 },
    { id: "graduate", nm: "Graduation Week", e: "🎓", icon: "grad", ask: "Master two skills this week. Three people, a witness each.", target: 2 },
    { id: "dry", nm: "Dry Days", e: "☀️", icon: "sun", ask: "Three days with outside trips and no accidents inside.", target: 3 },
    { id: "pack", nm: "Pack Week", e: "🐾", icon: "paw", ask: "Four days where every single person trained.", target: 4 },
    { id: "hattrick", nm: "Hat-trick Hunt", e: "🏆", icon: "trophy", ask: "Ten hat-trick days across the whole family.", target: 10 }
  ],
  challengePoints: 25,

  /* ---------- socialisation checklist with counters (AVSAB, Dunbar's 100 people) ---------- */
  socialGroups: [
    { id: "people", nm: "People", e: "🧑", items: ["A man with a beard", "Someone in a hat or hood", "A toddler (held, calm)", "A teenager", "An older person", "Someone in high-vis or uniform", "A person with a stick, wheelchair or pram", "Someone carrying a big box or bag", "A visitor sitting on the floor", "A friend's child (treats on the floor, puppy comes to them)"] },
    { id: "dogs", nm: "Dogs and animals", e: "🐕", items: ["A calm, fully vaccinated adult dog you know", "Puppy preschool classmates", "The cat, from behind a gate", "Chickens, sheep or stock (on lead, at a distance)", "A dog barking behind a fence"] },
    { id: "surfaces", nm: "Surfaces", e: "🪨", items: ["Wet grass", "Tiles or lino", "Gravel", "Sand or a beach", "Decking", "A metal grate or manhole cover", "A crinkly tarp or bubble wrap", "A wobbly board or cushion", "A low step up and down"] },
    { id: "sounds", nm: "Sounds", e: "🔊", items: ["Vacuum cleaner", "Hair dryer or blender", "Washing machine and dishwasher", "Doorbell and knocking", "Car doors and traffic", "Thunder recording, quietly", "Fireworks recording, then the real thing from indoors", "Lawnmower or chainsaw at a distance", "Playground noise", "Clapping and cheering"] },
    { id: "places", nm: "Places", e: "📍", items: ["The car, engine running", "The vet, just for treats", "Outside the shops in your arms", "School gate at pick-up, in your arms", "A friend's house", "A cafe footpath", "A river bank or beach (once vaccinated)", "A lift or escalator (carried)"] },
    { id: "handling", nm: "Handling", e: "🤲", items: ["Paws held, one by one", "Ears looked in", "Lip lifted, teeth looked at", "Tail touched", "Collar grabbed gently", "Picked up and put down", "Towel dry", "Brushed", "Nail clippers touched to a nail", "Harness on and off"] },
    { id: "things", nm: "Moving things", e: "🚲", items: ["Bikes and scooters going past", "A skateboard", "An umbrella opening", "A balloon", "The hose", "A ball rolling past (she stays with you)", "A shopping trolley", "A pushchair"] }
  ],
  socialMoods: [["happy", "😊 Happy"], ["unsure", "😐 Unsure"], ["scared", "😟 Scared"]],
  socialNote: "Quality beats quantity. A frightened puppy is being sensitised, not socialised. Pair everything with food, let her approach on her own, and leave while she is still happy. If she was unsure or scared, come back to that one another day, from further away.",

  /* ---------- the first year, keyed to her birthday (Howell 2015, AVSAB, Kinsman 2020, Asher 2020, Hart 2024, NZ vet timings) ---------- */
  timeline: [
    { wk: 8, nm: "Home", body: "The socialisation window is open but already waning. Carry her out to see the world every day. First vaccination. Bladder: about an hour or two in the day." },
    { wk: 9, nm: "Possible first wobbly fortnight", body: "Many pups startle easily around 8 to 11 weeks. Watch her, not the calendar: if something scares her, give distance and food, and try again another day. Biting peaks now; that is normal." },
    { wk: 10, nm: "Trade games", body: "Swap-for-a-treat with toys and chews, and drop something better into her bowl while she eats. Done now, resource guarding mostly never starts." },
    { wk: 12, nm: "Second vaccination, teeth start to loosen", body: "Preschool should have started. The 'certain' socialisation period ends about now, so the next fortnight is the last cheap one. Frozen chews for sore gums. Guy Fawkes falls here: fireworks from indoors with food, not outside." },
    { wk: 14, nm: "Outer edge of the window", body: "Start taking known skills to new rooms, the garden, then the street in your arms. Toilet trips drop to 6 to 8 a day." },
    { wk: 16, nm: "Third vaccination, teething in full swing", body: "Ten days after this jab she can walk footpaths and parks. Short, sniffy, soft ground. Puppies this age sleep about 11 hours a day in cohort data; keep the nap routine anyway." },
    { wk: 18, nm: "Adult canines appearing", body: "Last call for a puppy class. Protect the soft mouth: all teeth-on-skin ends play from here. Introduce the long line for recall." },
    { wk: 20, nm: "Five months", body: "Bladder holds 4 to 5 hours in the day. Retained baby teeth at 6 months need a vet check. Worming moves to the adult schedule." },
    { wk: 26, nm: "Adolescence can begin", body: "Recall and manners wobble between about 6 and 12 months, peaking around 8 months. More reward, not less, and nothing is lost. For a GSP-type dog the best recent evidence says desexing no earlier than 12 months; SPCA NZ advises earlier. Decide with your vet." },
    { wk: 34, nm: "Eight months: the dip", body: "Dogs are least obedient to their own people around now, and only to their own people. It passes. Keep sessions short and successful; keep socialising." },
    { wk: 52, nm: "One year", body: "Growth plates closing in medium-large dogs around now. Full exercise can build from here. Talk to the vet about desexing timing if you waited." }
  ],

  /* ---------- breed notes, matched against the breed field ---------- */
  breedNotes: [
    { match: "pointer|gsp|vizsla|weimaraner|setter|spaniel|retriever|lab", nm: "Gundog in there", body: "Bred to find, point, flush and carry. Strong nose, strong prey drive, lots of stamina. Recall and leave-it around birds are life skills, not tricks, so start recall games before the chase instinct matures. Retrieve and scent games give the drive a job. Separation worries are common: alone time from day one, in seconds." },
    { match: "heading|huntaway|collie|border|kelpie|shepherd|cattle|corgi|herd", nm: "Herding dog in there", body: "Bred to stare, circle and grab at close quarters. Running, shrieking children are the most exciting thing she will ever see, so no chase games, and play the 'watch the runner' game: one child walks, then jogs, then runs, at a distance where she can still eat for staying with you. Sound sensitivity is common, so take the sounds list seriously. Legal chase outlets: flirt pole on grass in short bursts (from about 5 months), fetch along the ground, tug with rules." },
    { match: "terrier|jack russell|staffy|staffordshire|bull", nm: "Terrier in there", body: "Tenacious, mouthy and brave. Tug with rules (drop on cue) is the best game you have. Find-it and scent games burn energy without winding her up." },
    { match: "poodle|oodle|doodle|bichon|maltese", nm: "Companion breed in there", body: "Clever and people-focused. Alone-time training matters more than usual, and grooming handling (brush, clippers, dryer) belongs on the socialisation list early." }
  ],

  /* ---------- health: NZ timings (Totally Vets, Petstock NZ; see hivemind research digest) ---------- */
  health: {
    kinds: [["vaccine", "Vaccination"], ["worm", "Worming"], ["flea", "Flea treatment"], ["vet", "Vet visit"], ["weight", "Weigh-in"]],
    vaccines: [[8, "First core vaccine (distemper, hepatitis, parvo); some clinics start at 6 weeks"], [12, "Second core vaccine; ask about leptospirosis (two doses, 3 to 4 weeks apart)"], [16, "Last puppy vaccine: 16 weeks or later (WSAVA 2024), though some NZ clinics finish at 12. Public walks 1 to 2 weeks after, when your vet says"], [52, "First booster: NZ clinics usually say 12 months after the course; WSAVA says it can be from 6 months old. Ask your vet"]],
    wormRule: "Every 2 weeks until 12 weeks, monthly until 6 months, then every 3 months. Weigh before each dose.",
    wormNext: (ageWeeks) => (ageWeeks < 12 ? 14 : ageWeeks < 26 ? 30 : 91),
    weightNote: "Weigh every fortnight or so until 6 months (clinics do it for free, and bathroom scales work: you, then you holding her). A lean puppy has fewer joint problems: you should see a waist from above and feel the ribs easily. Crossing growth bands up or down is a vet conversation, not a diet.",
    note: "Dates here are the schedule most NZ clinics use; clinics differ by a week or two, and some finish puppy vaccines at 12 weeks. Your vet's card wins. Nothing in this app is medical advice. Sources: docs/HEALTH-TIMINGS-REVIEW.md."
  }
};
if (typeof module === "object" && module.exports) module.exports = PUPPY_CONTENT; else window.PUPPY_CONTENT = PUPPY_CONTENT;
