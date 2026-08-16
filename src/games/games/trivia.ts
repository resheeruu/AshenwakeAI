import { GamePlayer } from "../types";
import { updatePlayer } from "../store";
import {
  applyLevelUp,
  updateAchievements,
} from "../rewards";

export type TriviaQuestion = {
  id: number;
  question: string;
  options: string[];
  answer: number;
  difficulty: "easy" | "medium" | "hard";
};

export type TriviaResult = {
  correct: boolean;
  question: TriviaQuestion;
  selectedAnswer: number;
  coins: number;
  xp: number;
  levelUp: boolean;
};

export const TRIVIA_QUESTIONS: TriviaQuestion[] = [
  {
    id: 1,
    question: "What is the capital of the Philippines?",
    options: [
      "Cebu",
      "Manila",
      "Davao",
      "Baguio",
    ],
    answer: 1,
    difficulty: "easy",
  },
  {
    id: 2,
    question: "Which planet is known as the Red Planet?",
    options: [
      "Venus",
      "Mars",
      "Jupiter",
      "Mercury",
    ],
    answer: 1,
    difficulty: "easy",
  },
  {
    id: 3,
    question: "How many sides does a hexagon have?",
    options: [
      "5",
      "6",
      "7",
      "8",
    ],
    answer: 1,
    difficulty: "easy",
  },
  {
    id: 4,
    question: "Which element has the chemical symbol Au?",
    options: [
      "Silver",
      "Gold",
      "Copper",
      "Iron",
    ],
    answer: 1,
    difficulty: "medium",
  },
  {
    id: 5,
    question: "What is the largest ocean on Earth?",
    options: [
      "Atlantic",
      "Indian",
      "Pacific",
      "Arctic",
    ],
    answer: 2,
    difficulty: "easy",
  },
  {
    id: 6,
    question: "Who wrote Romeo and Juliet?",
    options: [
      "William Shakespeare",
      "Charles Dickens",
      "Mark Twain",
      "Homer",
    ],
    answer: 0,
    difficulty: "medium",
  },
  {
    id: 7,
    question: "What is the square root of 144?",
    options: [
      "10",
      "11",
      "12",
      "14",
    ],
    answer: 2,
    difficulty: "easy",
  },
  {
    id: 8,
    question: "Which country is known as the Land of the Rising Sun?",
    options: [
      "China",
      "Japan",
      "South Korea",
      "Thailand",
    ],
    answer: 1,
    difficulty: "easy",
  },
  {
    id: 9,
    question: "What is the hardest natural substance?",
    options: [
      "Iron",
      "Diamond",
      "Quartz",
      "Titanium",
    ],
    answer: 1,
    difficulty: "medium",
  },
  {
    id: 10,
    question: "Which gas do plants primarily absorb during photosynthesis?",
    options: [
      "Oxygen",
      "Nitrogen",
      "Carbon dioxide",
      "Hydrogen",
    ],
    answer: 2,
    difficulty: "medium",
  },
  {
    id: 11,
    question: "What is the fastest land animal?",
    options: [
      "Lion",
      "Cheetah",
      "Horse",
      "Leopard",
    ],
    answer: 1,
    difficulty: "easy",
  },
  {
    id: 12,
    question: "How many continents are there?",
    options: [
      "5",
      "6",
      "7",
      "8",
    ],
    answer: 2,
    difficulty: "easy",
  },
];

export function randomTrivia(): TriviaQuestion {
  return TRIVIA_QUESTIONS[
    Math.floor(
      Math.random() * TRIVIA_QUESTIONS.length,
    )
  ];
}

function rewardForDifficulty(
  difficulty: TriviaQuestion["difficulty"],
): {
  coins: number;
  xp: number;
} {
  switch (difficulty) {
    case "hard":
      return {
        coins: 100,
        xp: 60,
      };

    case "medium":
      return {
        coins: 60,
        xp: 35,
      };

    default:
      return {
        coins: 30,
        xp: 20,
      };
  }
}

export async function answerTrivia(
  player: GamePlayer,
  question: TriviaQuestion,
  selectedAnswer: number,
): Promise<TriviaResult> {
  if (
    !Number.isInteger(selectedAnswer) ||
    selectedAnswer < 0 ||
    selectedAnswer >= question.options.length
  ) {
    throw new Error("INVALID_TRIVIA_ANSWER");
  }

  const correct =
    selectedAnswer === question.answer;

  let coins = 5;
  let xp = 5;

  if (correct) {
    const reward = rewardForDifficulty(
      question.difficulty,
    );

    coins = reward.coins;
    xp = reward.xp;

    player.wins++;
    player.streak++;

    player.bestStreak = Math.max(
      player.bestStreak,
      player.streak,
    );
  } else {
    player.losses++;
    player.streak = 0;
  }

  player.gamesPlayed++;
  player.coins += coins;
  player.xp += xp;

  const levelUp = applyLevelUp(player);

  updateAchievements(player);

  await updatePlayer(player);

  return {
    correct,
    question,
    selectedAnswer,
    coins,
    xp,
    levelUp,
  };
}
