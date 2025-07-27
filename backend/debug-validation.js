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

const testData = {
  idea: "我想開發一個功能完整的待辦清單應用程式，包含任務管理、分類標籤、提醒功能、數據同步等現代功能"
};

console.log('Test data:', testData);
console.log('Test data length:', testData.idea.length);

const { error, value } = schemas.generateIdea.validate(testData, { 
  abortEarly: false,
  stripUnknown: true 
});

console.log('Validation result:');
console.log('Error:', error);
console.log('Value:', value);