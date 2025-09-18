const { spawn } = require('child_process');
const path = require('path');

const scripts = [
  '1_fetch_contacts.js',
  '2_hoy.js',
  '3_wallentrie.js',
  '5_reporte.js'
];

async function runScript(script) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'instrucciones', script);
    const proc = spawn('node', [scriptPath], { stdio: 'inherit' });
    proc.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script ${script} terminó con código ${code}`));
      }
    });
  });
}

(async () => {
  for (const script of scripts) {
    console.log(`\n--- Ejecutando ${script} ---`);
    try {
      await runScript(script);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }
  console.log('\n✅ Proceso completo. Todos los scripts ejecutados.');
})();