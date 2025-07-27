// Test validation functionality
import Joi from 'joi';

const schemas = {
  generateIdea: Joi.object({
    idea: Joi.string().min(10).max(5000).required().messages({
      'string.min': 'Idea must be at least 10 characters long',
      'string.max': 'Idea cannot exceed 5000 characters',
      'any.required': 'Idea is required'
    })
  })
};

// Test data
const testData = { idea: "製作一個todo list" };

console.log('Testing validation with data:', testData);
console.log('Idea length:', testData.idea.length);

const { error, value } = schemas.generateIdea.validate(testData, { 
  abortEarly: false,
  stripUnknown: true 
});

if (error) {
  console.error('Validation failed:', error.details);
} else {
  console.log('Validation passed:', value);
}

// Test the middleware function
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

// Mock req, res, next to test middleware
const mockReq = {
  method: 'POST',
  body: testData
};

const mockRes = {
  status: (code) => ({
    json: (data) => {
      console.log('Response status:', code);
      console.log('Response data:', data);
    }
  })
};

const mockNext = () => {
  console.log('Validation middleware passed, next() called');
  console.log('Validated data:', mockReq.validatedData);
};

console.log('\nTesting validation middleware...');
const middleware = validateRequest(schemas.generateIdea);
middleware(mockReq, mockRes, mockNext);