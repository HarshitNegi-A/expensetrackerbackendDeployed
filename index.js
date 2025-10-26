const express = require('express')
const app = express()
const signupRoutes = require('./routes/signupRoutes')
const sequelize = require('./db')
const expenseRoutes = require('./routes/expenseRoutes')
const premiumRoutes = require('./routes/premiumRoutes')
const Expense = require('./model/ExpenseModel')
const User = require('./model/UserModel')
const Order = require('./model/OrderModel')
const ForgetPassword = require('./model/ForgetPasswordModel')
const cors = require('cors')
app.use(express.json());
app.use(cors({
  origin: 'https://expensetracker1101.netlify.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  credentials: true
}));
// app.options('*', cors());
app.use('/', signupRoutes)
app.use('/expense', expenseRoutes)
app.use('/premium', premiumRoutes);



User.hasMany(Expense, { foreignKey: 'userId', onDelete: 'CASCADE' })
Expense.belongsTo(User, { foreignKey: 'userId' })

User.hasMany(Order, { foreignKey: 'userId', onDelete: 'CASCADE' })
Order.belongsTo(User, { foreignKey: 'userId' })

User.hasMany(ForgetPassword, { foreignKey: 'userId', onDelete: 'CASCADE' });
ForgetPassword.belongsTo(User, { foreignKey: 'userId' });

sequelize.sync()
    .then(() => {
        console.log("Database connected successfully!")
        app.listen(3000, () => console.log("Server is running"))
    })
    .catch((err) => {
        console.error("Unable to connect to the database:", err);
    });
