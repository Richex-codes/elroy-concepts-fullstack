const mongoose = require('mongoose');
const schema = mongoose.Schema;

const branchSchema = new schema({
    name: {
        type: String,
        required: true,
        unique: true,
    },
})

module.exports = mongoose.model('Branch', branchSchema);