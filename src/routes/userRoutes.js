const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');
const projectController = require('../controllers/projectController')

router.post('/', userController.createUser);
router.post('/login', userController.loginUser);
router.get('/', authMiddleware, userController.getAllUsers);

router.put('/:id', authMiddleware, userController.updateUser);
router.delete('/:id', authMiddleware, userController.deleteUser);
router.post('/forgot-password', userController.forgotPassword);
router.post('/reset-password/:token', userController.resetPassword);

router.post('/projects', authMiddleware, projectController.createProject);
router.get('/projects', authMiddleware, projectController.getMyProjects);
router.post('/projects/join', authMiddleware, projectController.joinProject);
router.get('/projects/:id', authMiddleware, projectController.getProjectById);

router.post('/projects/:id/goals', authMiddleware, projectController.addGoal);
router.post('/projects/:id/actions', authMiddleware, projectController.addAction);
router.put('/projects/:id', authMiddleware, projectController.updateProject);

router.delete('/goals/:goalId', authMiddleware, projectController.deleteGoal);
router.delete('/actions/:actionId', authMiddleware, projectController.deleteAction);
router.post('/goals/:goalId/progress', authMiddleware, projectController.addGoalProgress);
router.delete('/projects/:id', authMiddleware, projectController.deleteProject);

router.get('/projects/:id/students', authMiddleware, projectController.getProjectStudents);

router.get('/:id', authMiddleware, userController.getUserById);

module.exports = router;
