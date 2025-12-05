const db = require('../db');
const crypto = require('crypto');

exports.createProject = async (req, res) => {
  const { 
    name, 
    description, 
    target_audience, 
    start_date, 
    end_date, 
    budget 
  } = req.body;

  const manager_id = req.user.id;

  if (!name || !start_date || !end_date) {
    return res.status(400).json({ error: 'Nome, data de início e data de fim são obrigatórios.' });
  }

  try {
    const codeSuffix = crypto.randomBytes(2).toString('hex').toUpperCase();
    const join_code = `APAN-${codeSuffix}`;

    const newProject = await db.query(
      `INSERT INTO projects 
       (name, description, target_audience, start_date, end_date, budget, join_code, manager_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING *`,
      [name, description, target_audience, start_date, end_date, budget, join_code, manager_id]
    );

    res.status(201).json(newProject.rows[0]);

  } catch (err) {
    if (err.constraint === 'projects_join_code_key') {
        return res.status(500).json({ error: 'Erro ao gerar código do projeto. Tente novamente.' });
    }
    res.status(500).send('Erro no servidor ao criar projeto.');
  }
};

exports.getMyProjects = async (req, res) => {
    const user_id = req.user.id;

    try {
        const projects = await db.query(`
            SELECT 
                p.*, 
                CASE 
                    WHEN p.manager_id = $1 THEN 'Gerente'
                    ELSE 'Participante'
                END as my_role
            FROM projects p
            LEFT JOIN project_students ps ON p.id = ps.project_id
            WHERE p.manager_id = $1 OR ps.student_id = $1
            ORDER BY p.created_at DESC
        `, [user_id]);

        res.status(200).json(projects.rows);
    } catch (err) {
        
        res.status(500).send('Erro ao buscar projetos.');
    }
};

exports.joinProject = async (req, res) => {
    const { code } = req.body;
    const student_id = req.user.id;

    if (!code) return res.status(400).json({ error: 'Código do projeto é obrigatório.' });

    try {
        const project = await db.query('SELECT id FROM projects WHERE join_code = $1', [code]);

        if (project.rows.length === 0) {
            return res.status(404).json({ error: 'Projeto não encontrado com este código.' });
        }

        const projectId = project.rows[0].id;

        await db.query(
            'INSERT INTO project_students (project_id, student_id) VALUES ($1, $2)',
            [projectId, student_id]
        );

        res.status(200).json({ message: 'Você entrou no projeto com sucesso!' });

    } catch (err) {
        
        if (err.code === '23505') { 
            return res.status(400).json({ error: 'Você já faz parte deste projeto.' });
        }
        res.status(500).send('Erro ao entrar no projeto.');
    }
};

exports.getProjectById = async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
        const projectQuery = await db.query(`
            SELECT 
                p.*, 
                (SELECT COUNT(*) FROM project_students WHERE project_id = p.id) as student_count,
                u.name as manager_name
            FROM projects p
            JOIN users u ON p.manager_id = u.id
            LEFT JOIN project_students ps ON p.id = ps.project_id
            WHERE p.id = $1 AND (p.manager_id = $2 OR ps.student_id = $2)
            GROUP BY p.id, u.name
        `, [id, userId]);

        if (projectQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Projeto não encontrado ou acesso negado.' });
        }

        const project = projectQuery.rows[0];

        const goalsQuery = await db.query(`
            SELECT 
                g.*,
                (
                    SELECT current_value 
                    FROM goal_progress gp 
                    WHERE gp.goal_id = g.id 
                    ORDER BY gp.registered_at DESC 
                    LIMIT 1
                ) as latest_value,
                (
                    SELECT comments 
                    FROM goal_progress gp 
                    WHERE gp.goal_id = g.id 
                    ORDER BY gp.registered_at DESC 
                    LIMIT 1
                ) as latest_comment
            FROM project_goals g
            WHERE g.project_id = $1
            ORDER BY g.created_at ASC
        `, [id]);

        res.status(200).json({
            ...project,
            goals: goalsQuery.rows
        });

    } catch (err) {
        
        res.status(500).send('Erro ao carregar detalhes do projeto.');
    }
};

exports.addGoal = async (req, res) => {
    const { id } = req.params;
    const { title, description, type, target_value } = req.body;

    if (!title || !type) {
        return res.status(400).json({ error: 'Título e tipo da meta são obrigatórios.' });
    }

    try {
        const newGoal = await db.query(
            `INSERT INTO project_goals (project_id, title, description, type, target_value) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [id, title, description, type, target_value || null]
        );
        res.status(201).json(newGoal.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao criar meta.' });
    }
};

exports.addAction = async (req, res) => {
    const { id } = req.params;
    const { title, type, description, date, status } = req.body;

    if (!title || !date || !type) {
        return res.status(400).json({ error: 'Título, tipo e data são obrigatórios.' });
    }

    try {
        const newAction = await db.query(
            `INSERT INTO project_actions (project_id, title, type, description, date, status) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [id, title, type, description, date, status || 'PENDING']
        );
        res.status(201).json(newAction.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao registrar ação.' });
    }
};

exports.getProjectById = async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
        const projectQuery = await db.query(`
            SELECT 
                p.*, 
                (SELECT COUNT(*) FROM project_students WHERE project_id = p.id) as student_count,
                u.name as manager_name
            FROM projects p
            JOIN users u ON p.manager_id = u.id
            LEFT JOIN project_students ps ON p.id = ps.project_id
            WHERE p.id = $1 AND (p.manager_id = $2 OR ps.student_id = $2)
            GROUP BY p.id, u.name
        `, [id, userId]);

        if (projectQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Projeto não encontrado ou acesso negado.' });
        }

        const project = projectQuery.rows[0];

        const goalsQuery = await db.query(`
            SELECT 
                g.*,
                (
                    SELECT current_value 
                    FROM goal_progress gp 
                    WHERE gp.goal_id = g.id 
                    ORDER BY gp.registered_at DESC 
                    LIMIT 1
                ) as latest_value,
                (
                    SELECT comments 
                    FROM goal_progress gp 
                    WHERE gp.goal_id = g.id 
                    ORDER BY gp.registered_at DESC 
                    LIMIT 1
                ) as latest_comment
            FROM project_goals g
            WHERE g.project_id = $1
            ORDER BY g.created_at ASC
        `, [id]);

        const actionsQuery = await db.query(`
            SELECT * FROM project_actions 
            WHERE project_id = $1 
            ORDER BY date DESC
        `, [id]);

        res.status(200).json({
            ...project,
            goals: goalsQuery.rows,
            actions: actionsQuery.rows
        });

    } catch (err) {
        
        res.status(500).send('Erro ao carregar detalhes do projeto.');
    }
};

exports.updateProject = async (req, res) => {
    const { id } = req.params;
    const { name, description, target_audience, start_date, end_date, budget } = req.body;
    const manager_id = req.user.id;

    try {
        const result = await db.query(
            `UPDATE projects 
             SET name = $1, description = $2, target_audience = $3, start_date = $4, end_date = $5, budget = $6
             WHERE id = $7 AND manager_id = $8
             RETURNING *`,
            [name, description, target_audience, start_date, end_date, budget, id, manager_id]
        );

        if (result.rows.length === 0) {
            return res.status(403).json({ error: 'Você não tem permissão para editar este projeto ou ele não existe.' });
        }

        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao atualizar projeto.' });
    }
};

exports.deleteGoal = async (req, res) => {
    const { goalId } = req.params;
    
    try {
        await db.query('DELETE FROM project_goals WHERE id = $1', [goalId]);
        res.status(200).json({ message: 'Meta excluída.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao excluir meta.' });
    }
};

exports.deleteAction = async (req, res) => {
    const { actionId } = req.params;

    try {
        await db.query('DELETE FROM project_actions WHERE id = $1', [actionId]);
        res.status(200).json({ message: 'Ação excluída.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao excluir ação.' });
    }
};

exports.addGoalProgress = async (req, res) => {
    const { goalId } = req.params;
    const { current_value, comments } = req.body;
    const userId = req.user.id;

    try {
        await db.query(
            `INSERT INTO goal_progress (goal_id, registered_by, current_value, comments) 
             VALUES ($1, $2, $3, $4)`,
            [goalId, userId, current_value || null, comments || null]
        );

        res.status(201).json({ message: 'Progresso registrado com sucesso.' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao atualizar progresso da meta.' });
    }
};

exports.deleteProject = async (req, res) => {
    const { id } = req.params;
    const manager_id = req.user.id;

    try {
        const result = await db.query(
            'DELETE FROM projects WHERE id = $1 AND manager_id = $2 RETURNING *',
            [id, manager_id]
        );

        if (result.rowCount === 0) {
            return res.status(403).json({ error: 'Você não tem permissão para excluir este projeto ou ele não existe.' });
        }

        res.status(200).json({ message: 'Projeto excluído com sucesso.' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao excluir projeto.' });
    }
};

exports.getProjectStudents = async (req, res) => {
    const { id } = req.params;

    try {
        const students = await db.query(`
            SELECT u.id, u.name, u.email, u.role, ps.joined_at
            FROM project_students ps
            JOIN users u ON ps.student_id = u.id
            WHERE ps.project_id = $1
            ORDER BY u.name ASC
        `, [id]);

        res.status(200).json(students.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar participantes do projeto.' });
    }
};
