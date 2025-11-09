const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function resetPassword() {
  const password = 'dani2025';
  const hash = await bcrypt.hash(password, 10);
  
  console.log('Generated hash:', hash);
  
  const user = await prisma.user.update({
    where: { email: 'andy@azdevops.io' },
    data: { password: hash }
  });
  
  console.log('Password updated for:', user.email);
  await prisma.$disconnect();
}

resetPassword().catch(console.error);
