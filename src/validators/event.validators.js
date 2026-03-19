const Joi = require('joi');
const { ObjectId } = require('./common.validators');

exports.createSchema = Joi.object({
  title: Joi.string().required().min(3).max(200),
  description: Joi.string().required().min(3).max(2000),
  images: Joi.array().items(Joi.string().uri()).required().length(5),
  location: Joi.string().required().min(3).max(200),
  startDate: Joi.date().required().greater('now'),
  endDate: Joi.date().required().greater(Joi.ref('startDate')),
  activityNotes: Joi.array()
    .items(
      Joi.object({
        icon: Joi.string().uri().required(),
        title: Joi.string().required().min(3).max(200),
        description: Joi.string().required().min(3).max(200),
      }),
    )
    .required()
    .min(1)
    .max(10),
  activityDescription: Joi.string().required().min(3).max(2000),
  itemIncluded: Joi.array()
    .items(
      Joi.object({
        icon: Joi.string().uri().required(),
        title: Joi.string().required().min(3).max(200),
        description: Joi.string().required().min(3).max(200),
      }),
    )
    .required()
    .min(1)
    .max(10),
  itemNeeded: Joi.array()
    .items(
      Joi.object({
        icon: Joi.string().uri().required(),
        title: Joi.string().required().min(3).max(200),
        description: Joi.string().required().min(3).max(200),
      }),
    )
    .required()
    .min(1)
    .max(10),
  informationNeeded: Joi.array()
    .items(
      Joi.object({
        icon: Joi.string().uri().required(),
        title: Joi.string().required().min(3).max(200),
        description: Joi.string().required().min(3).max(200),
      }),
    )
    .required()
    .min(1)
    .max(10),
  competitionData: Joi.object({
    categoryId: Joi.string().required().custom(ObjectId),
    subCategoryId: Joi.string().required().custom(ObjectId),
    parameterId: Joi.string().required().custom(ObjectId),
    calcType: Joi.string().required().valid('$change', '$sum'),
    userVoteMessage: Joi.string().required().min(3).max(200),
    difficulty: Joi.number().required().min(1).max(10),
    difficultyReason: Joi.string().required().min(3).max(200),
    direction: Joi.string().required().valid('Increase', 'Decrease'),
    currentStatus: Joi.number().required().min(0).max(100000),
    finalGoal: Joi.string().required().min(1).max(200),
    proof: Joi.string().required().min(3).max(200),
    startingNumber: Joi.number().required().min(0).max(100000),
  }).required(),
  competitionsInfo: Joi.object({
    team: Joi.object({
      allowed: Joi.boolean().required(),
      totalAmount: Joi.number().min(1).when('allowed', { is: true, then: Joi.required() }),
      wagerAmount: Joi.number()
        .min(1)
        .max(Joi.ref('totalAmount'))
        .when('allowed', { is: true, then: Joi.required() }),
      maxNoOfTeamMembers: Joi.number()
        .min(2)
        .max(20)
        .when('allowed', { is: true, then: Joi.required() }),
      maxNumberOfTeams: Joi.number()
        .min(1)
        .max(100)
        .when('allowed', { is: true, then: Joi.required() }),
      startDate: Joi.date()
        .min(Joi.ref('/startDate'))
        .when('allowed', { is: true, then: Joi.required() }),
      endDate: Joi.date()
        .max(Joi.ref('/endDate'))
        .when('allowed', { is: true, then: Joi.required() }),
    }).required(),
    survivor: Joi.object({
      allowed: Joi.boolean().required(),
      totalAmount: Joi.number().min(1).when('allowed', { is: true, then: Joi.required() }),
      wagerAmount: Joi.number()
        .min(1)
        .max(Joi.ref('totalAmount'))
        .when('allowed', { is: true, then: Joi.required() }),
      startDate: Joi.date()
        .min(Joi.ref('/startDate'))
        .when('allowed', { is: true, then: Joi.required() }),
      endDate: Joi.date()
        .max(Joi.ref('/endDate'))
        .when('allowed', { is: true, then: Joi.required() }),
    }).required(),
    both: Joi.object({
      allowed: Joi.boolean()
        .required()
        .custom((value, helpers) => {
          const { survivor, team } = helpers.state.ancestors[1];
          if (value && (!survivor.allowed || !team.allowed)) {
            return helpers.message(
              'Both can only be allowed if both survivor and teams are allowed',
            );
          }
          return value;
        }),
      totalAmount: Joi.number()
        .min(Joi.ref('...team.wagerAmount'))
        .min(Joi.ref('...survivor.wagerAmount'))
        .when('allowed', { is: true, then: Joi.required() })
        .custom((value, helpers) => {
          const { survivor, team } = helpers.state.ancestors[1];
          if (value < team.wagerAmount + survivor.wagerAmount) {
            return helpers.message(
              'Both Total Amount must be greater than or equal to the sum of Teams WagerAmount and Survivor WagerAmount',
            );
          }
          return value;
        }),
    }).required(),
  })
    .required()
    .custom((value, helpers) => {
      const { survivor, team } = value;
      if (!team.allowed && !survivor.allowed) {
        return helpers.message('At least one of team or survivor must be true');
      }
      return value;
    })
    .required(),
  maxNoOfPoeple: Joi.number().positive().integer().required()
    .min(1)
    .max(100000),
  tags: Joi.array().items(Joi.string()).optional(),
});

exports.findOneSchema = Joi.object({
  eventId: Joi.string().required().custom(ObjectId),
});

exports.getEntitySchema = Joi.object({
  entityName: Joi.string()
    .required()
    .trim()
    .valid('category', 'subCategory', 'parameter', 'competitionType'),
  itemName: Joi.string().trim().max(200).allow(''),
  categoryId: Joi.string().custom(ObjectId).when('entityName', {
    is: 'subCategory',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  pageNo: Joi.number().integer().positive(),
  pageSize: Joi.number().integer().positive(),
});

exports.joinTeamSchema = Joi.object({
  eventId: Joi.string().required().custom(ObjectId),
  teamOption: Joi.string().required().valid('createTeam', 'joinTeamWithRoomId', 'joinRandomTeam'),
  teamData: Joi.object().when('teamOption', {
    is: 'createTeam',
    then: Joi.object({
      name: Joi.string().required().min(3).max(200),
      allowRandomJoin: Joi.boolean().required(),
      addWaitingList: Joi.boolean().required(),
    }),
    otherwise: Joi.object().optional(),
  }),
  teamRoomId: Joi.string().when('teamOption', {
    is: 'joinTeamWithRoomId',
    then: Joi.string().required().length(6),
    otherwise: Joi.string().optional(),
  }),
});

exports.joinSurvivorSchema = Joi.object({
  eventId: Joi.string().required().custom(ObjectId),
});

exports.addToTeamSchema = Joi.object({
  eventId: Joi.string().required().custom(ObjectId),
  participantId: Joi.string().required().custom(ObjectId),
});
