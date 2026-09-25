import fs from 'fs';

const servicePath = 'src/Components/Screens/MachineScreensNew/deviceEventsService.js';
if (fs.existsSync(servicePath)) {
  let content = fs.readFileSync(servicePath, 'utf8');

  // Replace asValue(currentAlarmCount) or alarm_occurred mapping to correctly extract LEU
  // Let's inspect where currentAlarmCount is defined in deviceEventsService.js
  content = content.replace(
    /const currentAlarmCount\s*=\s*([\s\S]*?);/g,
    'const leuMatch = batch3?.payload?.match(/LEU:(\\d+)/);\n  const currentAlarmCount = leuMatch ? leuMatch[1] : ($1);'
  );

  fs.writeFileSync(servicePath, content, 'utf8');
  console.log("Updated deviceEventsService.js with regex for LEU extraction.");
}
