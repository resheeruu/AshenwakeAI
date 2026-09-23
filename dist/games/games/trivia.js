"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var trivia_exports = {};
__export(trivia_exports, {
  TRIVIA_QUESTIONS: () => TRIVIA_QUESTIONS,
  answerTrivia: () => answerTrivia,
  randomTrivia: () => randomTrivia
});
module.exports = __toCommonJS(trivia_exports);
var import_store = require("../store");
var import_rewards = require("../rewards");
const TRIVIA_QUESTIONS = [
  {
    id: 1,
    question: "What is the capital of the Philippines?",
    options: [
      "Cebu",
      "Manila",
      "Davao",
      "Baguio"
    ],
    answer: 1,
    difficulty: "easy"
  },
  {
    id: 2,
    question: "Which planet is known as the Red Planet?",
    options: [
      "Venus",
      "Mars",
      "Jupiter",
      "Mercury"
    ],
    answer: 1,
    difficulty: "easy"
  },
  {
    id: 3,
    question: "How many sides does a hexagon have?",
    options: [
      "5",
      "6",
      "7",
      "8"
    ],
    answer: 1,
    difficulty: "easy"
  },
  {
    id: 4,
    question: "Which element has the chemical symbol Au?",
    options: [
      "Silver",
      "Gold",
      "Copper",
      "Iron"
    ],
    answer: 1,
    difficulty: "medium"
  },
  {
    id: 5,
    question: "What is the largest ocean on Earth?",
    options: [
      "Atlantic",
      "Indian",
      "Pacific",
      "Arctic"
    ],
    answer: 2,
    difficulty: "easy"
  },
  {
    id: 6,
    question: "Who wrote Romeo and Juliet?",
    options: [
      "William Shakespeare",
      "Charles Dickens",
      "Mark Twain",
      "Homer"
    ],
    answer: 0,
    difficulty: "medium"
  },
  {
    id: 7,
    question: "What is the square root of 144?",
    options: [
      "10",
      "11",
      "12",
      "14"
    ],
    answer: 2,
    difficulty: "easy"
  },
  {
    id: 8,
    question: "Which country is known as the Land of the Rising Sun?",
    options: [
      "China",
      "Japan",
      "South Korea",
      "Thailand"
    ],
    answer: 1,
    difficulty: "easy"
  },
  {
    id: 9,
    question: "What is the hardest natural substance?",
    options: [
      "Iron",
      "Diamond",
      "Quartz",
      "Titanium"
    ],
    answer: 1,
    difficulty: "medium"
  },
  {
    id: 10,
    question: "Which gas do plants primarily absorb during photosynthesis?",
    options: [
      "Oxygen",
      "Nitrogen",
      "Carbon dioxide",
      "Hydrogen"
    ],
    answer: 2,
    difficulty: "medium"
  },
  {
    id: 11,
    question: "What is the fastest land animal?",
    options: [
      "Lion",
      "Cheetah",
      "Horse",
      "Leopard"
    ],
    answer: 1,
    difficulty: "easy"
  },
  {
    id: 12,
    question: "How many continents are there?",
    options: [
      "5",
      "6",
      "7",
      "8"
    ],
    answer: 2,
    difficulty: "easy"
  }
];
function randomTrivia() {
  return TRIVIA_QUESTIONS[Math.floor(
    Math.random() * TRIVIA_QUESTIONS.length
  )];
}
function rewardForDifficulty(difficulty) {
  switch (difficulty) {
    case "hard":
      return {
        coins: 100,
        xp: 60
      };
    case "medium":
      return {
        coins: 60,
        xp: 35
      };
    default:
      return {
        coins: 30,
        xp: 20
      };
  }
}
async function answerTrivia(player, question, selectedAnswer) {
  if (!Number.isInteger(selectedAnswer) || selectedAnswer < 0 || selectedAnswer >= question.options.length) {
    throw new Error("INVALID_TRIVIA_ANSWER");
  }
  const correct = selectedAnswer === question.answer;
  let coins = 5;
  let xp = 5;
  if (correct) {
    const reward = rewardForDifficulty(
      question.difficulty
    );
    coins = reward.coins;
    xp = reward.xp;
    player.wins++;
    player.streak++;
    player.bestStreak = Math.max(
      player.bestStreak,
      player.streak
    );
  } else {
    player.losses++;
    player.streak = 0;
  }
  player.gamesPlayed++;
  player.coins += coins;
  player.xp += xp;
  const levelUp = (0, import_rewards.applyLevelUp)(player);
  (0, import_rewards.updateAchievements)(player);
  await (0, import_store.updatePlayer)(player);
  return {
    correct,
    question,
    selectedAnswer,
    coins,
    xp,
    levelUp
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TRIVIA_QUESTIONS,
  answerTrivia,
  randomTrivia
});
