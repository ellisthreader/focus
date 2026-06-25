function active(records) {
  return Array.isArray(records)
    ? records.filter((item) => item && !item.deletedAt)
    : [];
}

export function personalizationReadiness(state = {}) {
  const profile = state.profile || {};
  const settings = state.settings || {};
  const localAi = settings.privacy?.assistant?.local || {};
  const areas = [
    {
      id: "profile",
      label: "Personal profile",
      complete: Boolean(profile.name && (profile.bio || profile.primaryGoal))
    },
    {
      id: "priorities",
      label: "Current priorities",
      complete: active(state.tasks).some((item) => !item.completed && item.status !== "completed")
    },
    {
      id: "schedule",
      label: "Schedule",
      complete: active(state.events).length > 0 || Boolean(profile.workStart && profile.workEnd)
    },
    {
      id: "goals",
      label: "Goals",
      complete: active(state.personalGoals).some((item) => item.status !== "completed")
        || Boolean(profile.primaryGoal)
    },
    {
      id: "wellbeing",
      label: "Wellbeing baseline",
      complete: active(state.healthEntries).length > 0
        || active(state.bodyMeasurements).length > 0
        || Boolean(profile.fitnessGoal || profile.nutritionGoal)
    },
    {
      id: "ai",
      label: "AI personalization",
      complete: Boolean(
        localAi.profile
        || localAi.nutrition
        || localAi.recovery
        || localAi.exercise
        || localAi.finance
        || localAi.learning
      )
    }
  ];
  const completed = areas.filter((area) => area.complete).length;
  return {
    areas,
    completed,
    total: areas.length,
    percent: Math.round((completed / areas.length) * 100),
    ready: completed === areas.length
  };
}
