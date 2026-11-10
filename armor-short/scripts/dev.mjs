// Live preview in your own browser (real-time on any machine with a GPU):
//   npm run dev   ->  http://localhost:5173/src/index.html?play&scale=0.5
import { serve } from './lib.mjs';
const { port } = await serve(5173);
console.log(`preview: http://localhost:${port}/src/index.html?play&scale=0.5`);
console.log('add &msaa=0 for speed, change scale=1 for full resolution');
