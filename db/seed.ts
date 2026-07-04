// Seed script: creates a default admin user and a few sample services + members.
// Run with: pnpm db:seed
import { hash } from "bcryptjs";
import { nanoid } from "nanoid";

// Node 20.6+/24: load .env before importing the db client.
try {
  process.loadEnvFile(".env");
} catch {
  // env already provided
}

async function main() {
  const { db } = await import("./index");
  const { users, members, services } = await import("./schema");

  console.log("Seeding database...");

  // --- Default admin user -------------------------------------------------
  const adminUsername = "admin";
  const passwordHash = await hash("admin123", 10);

  await db
    .insert(users)
    .values({
      name: "Church Admin",
      username: adminUsername,
      email: "admin@church.local",
      passwordHash,
      role: "admin",
      mustChangePassword: false,
    })
    .onConflictDoNothing({ target: users.username });

  console.log(`  ✓ Admin user ready:  ${adminUsername} / admin123`);

  // --- Sample members -----------------------------------------------------
  const existingMembers = await db.$count(members);
  if (existingMembers === 0) {
    await db.insert(members).values([
      {
        qrToken: nanoid(16),
        fullName: "Juan Dela Cruz",
        birthdate: "1985-04-12",
        spiritualBirthday: "2010-06-20",
        memberSinceYear: 2010,
        gender: "male",
        maritalStatus: "married",
        spouseName: "Maria Dela Cruz",
        weddingAnniversary: "2012-02-14",
        contactNumber: "0917-123-4567",
        homeAddress: "123 Rizal St, Quezon City",
        motherName: "Rosa Dela Cruz",
        fatherName: "Pedro Dela Cruz",
        educationalLevel: "College Graduate",
        occupation: "Engineer",
      },
      {
        qrToken: nanoid(16),
        fullName: "Maria Santos",
        birthdate: "1990-09-30",
        spiritualBirthday: "2015-01-11",
        memberSinceYear: 2015,
        gender: "female",
        maritalStatus: "single",
        contactNumber: "0918-987-6543",
        homeAddress: "45 Mabini Ave, Manila",
        motherName: "Elena Santos",
        fatherName: "Jose Santos",
        educationalLevel: "College Graduate",
        occupation: "Teacher",
      },
      {
        qrToken: nanoid(16),
        fullName: "Pedro Reyes",
        birthdate: "1978-12-05",
        spiritualBirthday: "2005-08-15",
        memberSinceYear: 2005,
        gender: "male",
        maritalStatus: "widowed",
        spouseName: "Ana Reyes",
        contactNumber: "0920-555-1212",
        homeAddress: "78 Bonifacio Rd, Caloocan",
        motherName: "Lucia Reyes",
        fatherName: "Ramon Reyes",
        educationalLevel: "High School Graduate",
        occupation: "Driver",
      },
    ]);
    console.log("  ✓ 3 sample members created");
  } else {
    console.log(`  • Members already present (${existingMembers}), skipping`);
  }

  // --- Sample services ----------------------------------------------------
  const existingServices = await db.$count(services);
  if (existingServices === 0) {
    const now = new Date();
    const thisSunday = new Date(now);
    thisSunday.setDate(now.getDate() + ((7 - now.getDay()) % 7));
    thisSunday.setHours(9, 0, 0, 0);

    const wednesday = new Date(now);
    wednesday.setDate(now.getDate() + ((3 - now.getDay() + 7) % 7));
    wednesday.setHours(19, 0, 0, 0);

    await db.insert(services).values([
      {
        name: "Sunday Worship Service",
        type: "sunday_service",
        scheduledAt: thisSunday,
        location: "Main Sanctuary",
      },
      {
        name: "Midweek Prayer Meeting",
        type: "midweek_service",
        scheduledAt: wednesday,
        location: "Fellowship Hall",
      },
    ]);
    console.log("  ✓ 2 sample services created");
  } else {
    console.log(`  • Services already present (${existingServices}), skipping`);
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
