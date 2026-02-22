const { Sequelize, DataTypes } = require('sequelize');

const sequelize = new Sequelize('derbakegen', process.env.POSTGRES_USER, process.env.POSTGRES_PASSWORD, {
    host: process.env.POSTGRES_HOST,
    dialect: 'postgres',
    logging: false
});

// Define the model
const User = sequelize.define('User', {
    id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false
    },
    username: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false
    },
    role: {
        type: DataTypes.STRING,
        unique: false,
        allowNull: false,
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    },
    deletedAt: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'users',
    freezeTableName: true,
    timestamps: true,
    paranoid: true
});

const Question = sequelize.define('Question', {
    id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false
    },
    question: {
        type: DataTypes.STRING,
        allowNull: false
    },
    description: {
        type: DataTypes.STRING
    },
    active: {
        type: DataTypes.BOOLEAN,
        default: true
    },
}, {
    timestamps: true,
    tableName: "questions",
    freezeTableName: true,
    paranoid: true
});

const Rating = sequelize.define("Rating", {
    id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false
    },
    sound: {
        type: DataTypes.STRING,
        allowNull: false,
        references: {
            model: 'sounds',
            key: 'id'
        },
        onDelete: 'SET NULL',
    },
    rated_by: {
        type: DataTypes.STRING,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        },
        onDelete: 'SET NULL',
    },
    ratings: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: []
    },
}, {
    timestamps: true,
    tableName: "ratings",
    freezeTableName: true,
    paranoid: true
});

const Sound = sequelize.define('Sound', {
    id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false
    },
    generated_by: {
        type: DataTypes.STRING,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        },
        onDelete: 'SET NULL',
    },
    url: {
        type: DataTypes.STRING,
        allowNull: false
    },
    settings: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {}
    },
}, {
    tableName: 'sounds',
    freezeTableName: true,
    timestamps: false,
});

// After defining all models, add associations:
// Sound associations
Sound.hasMany(Rating, {
    foreignKey: 'sound',
    as: 'ratings'
});

Sound.belongsTo(User, {
    foreignKey: 'generated_by',
    as: 'generator'
});

// Rating associations
Rating.belongsTo(Sound, {
    foreignKey: 'sound',
    as: 'soundInfo'
});

Rating.belongsTo(User, {
    foreignKey: 'rated_by',
    as: 'rater'
});

// User associations
User.hasMany(Sound, {
    foreignKey: 'generated_by',
    as: 'sounds'
});

User.hasMany(Rating, {
    foreignKey: 'rated_by',
    as: 'ratings'
});

(async () => {
    try {
        await sequelize.authenticate();
        console.log('Connection established successfully.');
        await User.sync({ alter: false });
        await Question.sync({ alter: false });
        await Rating.sync({ alter: false });
        await Sound.sync({ alter: false });
        console.log('Tables synced successfully.');
    } catch (err) {
        console.error('Error connecting or syncing:', err);
    }
})();


module.exports = { Question, User, Sound, Rating, sequelize };