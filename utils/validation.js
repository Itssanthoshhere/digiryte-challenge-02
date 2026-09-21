const { z } = require('zod');

const taskCreateSchema = z.object({
  boardId: z.string().optional(),
  title: z.string().min(1, 'Title cannot be empty').max(250, 'Title too long').trim(),
  clientMutationId: z.string().optional(),
});

const taskMoveSchema = z.object({
  boardId: z.string().optional(),
  taskId: z.string().min(1, 'Task ID is required'),
  toColumn: z.enum(['todo', 'in-progress', 'done'], {
    errorMap: () => ({ message: 'Invalid target column' }),
  }),
  order: z.union([z.string(), z.number()]).optional(),
  expectedVersion: z.number().int().positive().optional(),
  clientMutationId: z.string().optional(),
});

const taskDeleteSchema = z.object({
  boardId: z.string().optional(),
  taskId: z.string().min(1, 'Task ID is required'),
  expectedVersion: z.number().int().positive().optional(),
  clientMutationId: z.string().optional(),
});

function validatePayload(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues || result.error.errors || [];
    const formattedError = issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ') || 'Invalid payload';
    return { valid: false, error: formattedError, data: null };
  }
  return { valid: true, error: null, data: result.data };
}

module.exports = {
  taskCreateSchema,
  taskMoveSchema,
  taskDeleteSchema,
  validatePayload,
};
