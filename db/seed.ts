// Seed script: creates a default admin user and a few sample services + members.
// Run with: bun run db:seed
import { createClient } from "@supabase/supabase-js";
import { nanoid } from "nanoid";

// Node 20.6+/24: load .env before importing the db client.
try {
  process.loadEnvFile(".env");
} catch {
  // env already provided
}

async function main() {
  const { db } = await import("./index");
  const { users, members, services, cellGroups, songs, ministryMembers } =
    await import("./schema");
  const { eq } = await import("drizzle-orm");

  console.log("Seeding database...");

  // --- Default admin user -------------------------------------------------
  // Supabase Auth owns the credential, so the account is created there first
  // and the id it assigns becomes the profile row's primary key.
  const adminEmail = "admin@church.local";
  const adminPassword = "admin123";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to seed the admin",
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const existingAdmin = await db.query.users.findFirst({
    where: eq(users.email, adminEmail),
  });

  if (existingAdmin) {
    console.log(`  • Admin already present: ${adminEmail}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
    });

    if (error || !data.user) {
      throw new Error(`Could not create the admin account: ${error?.message}`);
    }

    await db.insert(users).values({
      id: data.user.id,
      name: "Church Admin",
      email: adminEmail,
      roleId: "admin",
      mustChangePassword: false,
    });

    console.log(`  ✓ Admin user ready:  ${adminEmail} / ${adminPassword}`);
  }

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
      // One of each non-active status, so the directory's default view and its
      // Status facet have something to hide and show.
      {
        qrToken: nanoid(16),
        fullName: "Liza Mendoza",
        firstName: "Liza",
        lastName: "Mendoza",
        gender: "female",
        status: "visitor",
        contactNumber: "0921-444-0101",
      },
      {
        qrToken: nanoid(16),
        fullName: "Carlo Bautista",
        firstName: "Carlo",
        lastName: "Bautista",
        memberSinceYear: 2016,
        gender: "male",
        status: "inactive",
      },
      {
        qrToken: nanoid(16),
        fullName: "Grace Villanueva",
        firstName: "Grace",
        lastName: "Villanueva",
        memberSinceYear: 2012,
        gender: "female",
        status: "transferred",
      },
      {
        qrToken: nanoid(16),
        fullName: "Ernesto Garcia",
        firstName: "Ernesto",
        lastName: "Garcia",
        birthdate: "1940-03-02",
        memberSinceYear: 1998,
        gender: "male",
        status: "deceased",
      },
    ]);
    console.log("  ✓ 7 sample members created");
  } else {
    console.log(`  • Members already present (${existingMembers}), skipping`);
  }

  // --- Sample cell groups -------------------------------------------------
  const existingCells = await db.$count(cellGroups);
  if (existingCells === 0) {
    const byName = async (name: string) =>
      (await db.query.members.findFirst({
        where: eq(members.fullName, name),
      }))?.id ?? null;

    const juan = await byName("Juan Dela Cruz"); // becomes leader-of-leaders
    const maria = await byName("Maria Santos"); // cell leader under Juan
    const pedro = await byName("Pedro Reyes"); // ordinary member in Maria's cell

    if (juan && maria) {
      const [root] = await db
        .insert(cellGroups)
        .values({
          name: "Pastor's Network",
          leaderId: juan,
          meetingDay: 0,
          meetingTime: "10:30",
          meetingLocation: "Main Sanctuary",
        })
        .returning({ id: cellGroups.id });

      const [anaCell] = await db
        .insert(cellGroups)
        .values({
          name: "Maria's Cell",
          leaderId: maria,
          parentCellGroupId: root.id,
          meetingDay: 3,
          meetingTime: "19:00",
          meetingLocation: "Room 2",
        })
        .returning({ id: cellGroups.id });

      // Leaders belong to the cell they lead; Pedro is a plain member.
      await db.update(members).set({ cellGroupId: root.id }).where(eq(members.id, juan));
      await db.update(members).set({ cellGroupId: anaCell.id }).where(eq(members.id, maria));
      if (pedro) {
        await db.update(members).set({ cellGroupId: anaCell.id }).where(eq(members.id, pedro));
      }

      // A few members intentionally left with NO cell group, so the graph's
      // "⚠ N not in a cell group" panel is populated and the headline feature
      // (spotting unassigned members) is demonstrable on a fresh seed.
      const unassignedNames = [
        "Lito Aquino",
        "Rosa Villanueva",
        "Ben Tolentino",
        "Grace Mendoza",
      ];
      for (const fullName of unassignedNames) {
        const exists = await db.query.members.findFirst({
          where: eq(members.fullName, fullName),
        });
        if (!exists) {
          await db.insert(members).values({ qrToken: nanoid(16), fullName });
        }
      }

      console.log(
        "  ✓ 2 sample cell groups + 4 unassigned members created",
      );
    }
  } else {
    console.log(`  • Cell groups already present (${existingCells}), skipping`);
  }

  // --- Sample services ----------------------------------------------------
  const existingServices = await db.$count(services);
  if (existingServices === 0) {
    // The coming Sunday and Wednesday on the church's calendar, at church
    // time — the same whatever zone the machine running the seed is in.
    const { zonedInstant } = await import("../lib/church-time");
    const { addDays, todayIn, weekdayOf } = await import("../lib/dates");
    const today = todayIn();
    const thisSunday = zonedInstant(addDays(today, (7 - weekdayOf(today)) % 7), "09:00");
    const wednesday = zonedInstant(
      addDays(today, (3 - weekdayOf(today) + 7) % 7),
      "19:00",
    );

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

  // --- LAM: a song library and a roster ------------------------------------
  // The LAM ministry itself comes from the migration; only its data is seeded.
  const existingSongs = await db.$count(songs);
  if (existingSongs === 0) {
    await db.insert(songs).values([
      { title: "Way Maker", artist: "Sinach", defaultKey: "E", tempo: 68 },
      { title: "Goodness of God", artist: "Bethel Music", defaultKey: "A", tempo: 63 },
      { title: "Build My Life", artist: "Housefires", defaultKey: "G", tempo: 70 },
      { title: "Dakilang Katapatan", defaultKey: "G", tempo: 72 },
    ]);

    const maria = await db.query.members.findFirst({
      where: eq(members.fullName, "Maria Santos"),
    });
    const rosa = await db.query.members.findFirst({
      where: eq(members.fullName, "Rosa Villanueva"),
    });
    const roster = [
      maria && { ministryId: "lam", memberId: maria.id, position: "head" as const },
      rosa && { ministryId: "lam", memberId: rosa.id },
    ].filter((row) => !!row);
    if (roster.length) {
      await db.insert(ministryMembers).values(roster).onConflictDoNothing();
    }
    console.log("  ✓ 4 sample songs and a LAM roster created");
  } else {
    console.log(`  • Songs already present (${existingSongs}), skipping`);
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
