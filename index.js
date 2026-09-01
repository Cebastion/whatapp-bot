import express from 'express';

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
    res.status(200).send('Welcome to Your Vue.js App!');
})

app.listen(3000, () => {
    console.log('Server running on port 3000');
});