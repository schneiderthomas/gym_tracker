// Hand-picked starter routines: fixed lists, not generated. Each uses only the equipment in
// SUGGESTED_EQUIPMENT. Exercises are [exerciseId, sets, target reps]; weight is left blank
// for the user. tests/suggestions.test.js checks every id, equipment type and muscle against
// data/exercises.json.

export const SUGGESTED_EQUIPMENT = ['body only', 'cable', 'dumbbell', 'kettlebells'];

export const SUGGESTED_ROUTINES = [
  {
    id: 'suggested-chest-a', day: 'chest', name: 'Chest A: dumbbells & push-ups',
    exercises: [
      ['Dumbbell_Bench_Press', 3, 10],
      ['Incline_Dumbbell_Press', 3, 10],
      ['Dumbbell_Flyes', 3, 12],
      ['Pushups', 3, 12],
    ],
  },
  {
    id: 'suggested-chest-b', day: 'chest', name: 'Chest B: cable & kettlebell',
    exercises: [
      ['Cable_Chest_Press', 3, 10],
      ['Incline_Cable_Chest_Press', 3, 10],
      ['One-Arm_Kettlebell_Floor_Press', 3, 8],
      ['Cable_Crossover', 3, 12],
      ['Push-Ups_With_Feet_Elevated', 3, 10],
    ],
  },
  {
    id: 'suggested-back-a', day: 'back', name: 'Back A: dumbbells & bodyweight',
    exercises: [
      ['Chin-Up', 3, 6],
      ['One-Arm_Dumbbell_Row', 3, 10],
      ['Bent_Over_Two-Dumbbell_Row', 3, 10],
      ['Dumbbell_Shrug', 3, 12],
    ],
  },
  {
    id: 'suggested-back-b', day: 'back', name: 'Back B: cable & kettlebell',
    exercises: [
      ['Wide-Grip_Lat_Pulldown', 3, 10],
      ['Seated_Cable_Rows', 3, 10],
      ['Two-Arm_Kettlebell_Row', 3, 10],
      ['Straight-Arm_Pulldown', 3, 12],
      ['Cable_Shrugs', 3, 12],
    ],
  },
  {
    id: 'suggested-legs-a', day: 'legs', name: 'Legs A: dumbbells & bodyweight',
    exercises: [
      ['Dumbbell_Squat', 3, 10],
      ['Stiff-Legged_Dumbbell_Deadlift', 3, 10],
      ['Dumbbell_Lunges', 3, 10],
      ['Single_Leg_Glute_Bridge', 3, 12],
      ['Standing_Dumbbell_Calf_Raise', 3, 15],
    ],
  },
  {
    id: 'suggested-legs-b', day: 'legs', name: 'Legs B: kettlebell & cable',
    exercises: [
      ['Goblet_Squat', 3, 10],
      ['One-Arm_Kettlebell_Swings', 3, 15],
      ['Kettlebell_One-Legged_Deadlift', 3, 8],
      ['Pull_Through', 3, 12],
      ['Step-up_with_Knee_Raise', 3, 10],
    ],
  },
  {
    id: 'suggested-shoulders-a', day: 'shoulders', name: 'Shoulders A: dumbbells',
    exercises: [
      ['Seated_Dumbbell_Press', 3, 10],
      ['Side_Lateral_Raise', 3, 12],
      ['Front_Dumbbell_Raise', 3, 12],
      ['Reverse_Flyes', 3, 12],
    ],
  },
  {
    id: 'suggested-shoulders-b', day: 'shoulders', name: 'Shoulders B: cable & kettlebell',
    exercises: [
      ['Two-Arm_Kettlebell_Military_Press', 3, 8],
      ['Cable_Seated_Lateral_Raise', 3, 12],
      ['Face_Pull', 3, 15],
      ['Cable_Rear_Delt_Fly', 3, 12],
      ['Kettlebell_Halo', 2, 10],
    ],
  },
  {
    id: 'suggested-arms-a', day: 'arms', name: 'Arms A: dumbbells & bodyweight',
    exercises: [
      ['Dumbbell_Bicep_Curl', 3, 10],
      ['Hammer_Curls', 3, 10],
      ['Bench_Dips', 3, 12],
      ['Standing_Dumbbell_Triceps_Extension', 3, 10],
      ['Tricep_Dumbbell_Kickback', 3, 12],
    ],
  },
  {
    id: 'suggested-arms-b', day: 'arms', name: 'Arms B: cable & kettlebell',
    exercises: [
      ['Standing_Biceps_Cable_Curl', 3, 12],
      ['Cable_Hammer_Curls_-_Rope_Attachment', 3, 12],
      ['Triceps_Pushdown_-_Rope_Attachment', 3, 12],
      ['Cable_Rope_Overhead_Triceps_Extension', 3, 12],
      ['Kettlebell_Overhead_Triceps_Extension', 3, 10],
    ],
  },
  {
    id: 'suggested-core-a', day: 'core', name: 'Core A: bodyweight',
    exercises: [
      ['Dead_Bug', 3, 10],
      ['Reverse_Crunch', 3, 12],
      ['Flat_Bench_Lying_Leg_Raise', 3, 12],
      ['Oblique_Crunches_-_On_The_Floor', 3, 12],
      ['Russian_Twist', 3, 16],
    ],
  },
  {
    id: 'suggested-core-b', day: 'core', name: 'Core B: cable & dumbbell',
    exercises: [
      ['Cable_Crunch', 3, 12],
      ['Pallof_Press', 3, 10],
      ['Standing_Cable_Wood_Chop', 3, 10],
      ['Dumbbell_Side_Bend', 3, 12],
    ],
  },
  {
    id: 'suggested-full-body-a', day: 'full body', name: 'Full body A: dumbbells & bodyweight',
    exercises: [
      ['Dumbbell_Squat', 3, 10],
      ['Pushups', 3, 12],
      ['One-Arm_Dumbbell_Row', 3, 10],
      ['Standing_Dumbbell_Press', 3, 10],
      ['Stiff-Legged_Dumbbell_Deadlift', 3, 10],
      ['Dead_Bug', 3, 10],
    ],
  },
  {
    id: 'suggested-full-body-b', day: 'full body', name: 'Full body B: kettlebell & cable',
    exercises: [
      ['Goblet_Squat', 3, 10],
      ['One-Arm_Kettlebell_Swings', 3, 15],
      ['Cable_Chest_Press', 3, 10],
      ['Seated_Cable_Rows', 3, 10],
      ['Two-Arm_Kettlebell_Military_Press', 3, 8],
      ['Pallof_Press', 3, 10],
    ],
  },
];

// Turns a suggestion into the exercise list used by workouts and routines.
// byId: Map of dataset id -> exercise (for names).
export function expandSuggestion(suggestion, byId) {
  return suggestion.exercises.map(([exerciseId, sets, reps]) => ({
    exerciseId,
    name: byId.get(exerciseId)?.name ?? exerciseId.replace(/_/g, ' '),
    sets: Array.from({ length: sets }, () => ({ reps, weight: null })),
  }));
}

export function routineFromSuggestion(suggestion, byId, id) {
  return {
    id,
    name: suggestion.name,
    exercises: expandSuggestion(suggestion, byId),
    sourceId: suggestion.id,
  };
}
