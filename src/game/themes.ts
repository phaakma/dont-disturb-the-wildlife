export interface WildlifeTheme {
  id: string;
  label: string;
  pluralLabel: string;
  icon: string;
  loseMessage: string;
  winMessage: string;
}

export const DEFAULT_THEME_ID = "kiwi";

export const THEMES: WildlifeTheme[] = [
  {
    id: "kiwi",
    label: "Kiwi",
    pluralLabel: "kiwis",
    icon: `${import.meta.env.BASE_URL}animals/kiwi.svg`,
    loseMessage:
      "Oh no! You woke up the kiwi! Kiwis are shy, nocturnal, and should not be disturbed. Try again and be more careful next time.",
    winMessage:
      "You tiptoed past every kiwi without a sound! New Zealand's favourite flightless bird sleeps soundly tonight.",
  },
  {
    id: "bear",
    label: "Bear",
    pluralLabel: "bears",
    icon: `${import.meta.env.BASE_URL}animals/bear.svg`,
    loseMessage: "Uh oh, you disturbed a sleeping bear! It was NOT ready to wake up. Try again and tread more lightly.",
    winMessage: "Not a single bear stirred! You're basically a ninja in the woods.",
  },
  {
    id: "snake",
    label: "Snake",
    pluralLabel: "snakes",
    icon: `${import.meta.env.BASE_URL}animals/snake.svg`,
    loseMessage: "Hisss! You startled a snake and it is not happy about it. Try again and watch your step.",
    winMessage: "Every snake stayed coiled up and undisturbed. Smooth moves!",
  },
  {
    id: "crocodile",
    label: "Crocodile",
    pluralLabel: "crocodiles",
    icon: `${import.meta.env.BASE_URL}animals/crocodile.svg`,
    loseMessage: "Snap! You woke a crocodile mid-nap and it's feeling grumpy. Try again and keep your distance.",
    winMessage: "You navigated the swamp without waking a single crocodile. Impressive!",
  },
  {
    id: "panther",
    label: "Panther",
    pluralLabel: "panthers",
    icon: `${import.meta.env.BASE_URL}animals/panther.svg`,
    loseMessage: "You crossed paths with a panther and it did NOT appreciate the surprise. Try again, quieter this time.",
    winMessage: "Every panther stayed hidden in the shadows, none the wiser. Well played!",
  },
  {
    id: "lion",
    label: "Lion",
    pluralLabel: "lions",
    icon: `${import.meta.env.BASE_URL}animals/lion.svg`,
    loseMessage: "Roar! You woke the king of the jungle and he is not pleased. Try again and be more careful next time.",
    winMessage: "You tiptoed around every lion without waking the pride. Legendary!",
  },
  {
    id: "giraffe",
    label: "Giraffe",
    pluralLabel: "giraffes",
    icon: `${import.meta.env.BASE_URL}animals/giraffe.svg`,
    loseMessage: "Whoa! You startled a giraffe and it took a very tall step back in alarm. Try again and watch where you walk.",
    winMessage: "Every giraffe kept quietly grazing above it all. Nicely done!",
  },
  {
    id: "turtle",
    label: "Turtle",
    pluralLabel: "turtles",
    icon: `${import.meta.env.BASE_URL}animals/turtle.svg`,
    loseMessage: "You've disturbed a turtle and it's ducked back into its shell! Try again and keep it quiet.",
    winMessage: "Not a single turtle noticed you. Stealthy work!",
  },
  {
    id: "elephant",
    label: "Elephant",
    pluralLabel: "elephants",
    icon: `${import.meta.env.BASE_URL}animals/elephant.svg`,
    loseMessage: "You spooked an elephant and the whole herd felt it rumble. Try again and tread lightly.",
    winMessage: "Every elephant kept calmly wandering, undisturbed. Gentle giant approved!",
  },
  {
    id: "owl",
    label: "Owl",
    pluralLabel: "owls",
    icon: `${import.meta.env.BASE_URL}animals/owl.svg`,
    loseMessage: "Hoot! You woke a sleeping owl mid-daydream and it is not amused. Try again and be quieter.",
    winMessage: "Every owl slept soundly through your whole visit. Impressively quiet!",
  },
];

const THEMES_BY_ID = new Map(THEMES.map((t) => [t.id, t]));

export function getTheme(id: string | null | undefined): WildlifeTheme {
  if (id) {
    const theme = THEMES_BY_ID.get(id);
    if (theme) return theme;
  }
  return THEMES_BY_ID.get(DEFAULT_THEME_ID)!;
}

export function isValidThemeId(id: string | null | undefined): boolean {
  return id != null && THEMES_BY_ID.has(id);
}
