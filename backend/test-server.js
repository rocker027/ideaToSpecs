import express from 'express';
import Joi from 'joi';

const app = express();
app.use(express.json());

// Validation schemas
const schemas = {
  generateIdea: Joi.object({
    idea: Joi.string().min(10).max(5000).required().messages({
      'string.min': 'Idea must be at least 10 characters long',
      'string.max': 'Idea cannot exceed 5000 characters',
      'any.required': 'Idea is required'
    })
  })
};

// Input validation middleware
const validateRequest = (schema) => {
  return (req, res, next) => {
    const dataToValidate = req.method === 'GET' ? req.query : req.body;
    const { error, value } = schema.validate(dataToValidate, { 
      abortEarly: false,
      stripUnknown: true 
    });

    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join(', ');
      return res.status(400).json({
        error: 'Validation error',
        message: errorMessage,
        details: error.details
      });
    }

    req.validatedData = value;
    next();
  };
};

// Simple test function
function generateIntelligentFallbackSpec(idea) {
  return `# Test Spec for: ${idea}\n\nThis is a test specification.`;
}

// Test route
app.post('/api/generate', 
  validateRequest(schemas.generateIdea),
  async (req, res) => {
    try {
      const { idea } = req.validatedData;
      console.log('Processing idea:', idea);
      
      const spec = generateIntelligentFallbackSpec(idea);
      
      res.json({
        success: true,
        id: Date.now(),
        userInput: idea,
        generatedSpec: spec,
        processingTime: 100
      });
    } catch (error) {
      console.error('Error in /api/generate:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
);

const PORT = 3002;
app.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`);
});