// Optional DEMO data for local evaluation (`npm run db:seed`). Not for production.
// Creates one demo workspace with the four roles. All accounts use the password below.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const PASSWORD = "demo-password-1";

async function main() {
  const existing = await db.user.findUnique({ where: { email: "admin@demo.comarketing.test" } });
  if (existing) {
    console.log("Demo workspace already exists. Skipping.");
    return;
  }
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const company = await db.company.create({
    data: {
      name: "Demo Coffee Roasters",
      industry: "Specialty coffee",
      timezone: "Africa/Cairo",
      brandVoice: "Warm, knowledgeable and concise. Celebrate craft without jargon. No exaggerated claims.",
      targetAudience: "Coffee lovers aged 22–45 and small cafés looking for a roasting partner.",
      campaignGoals: "Introduce this month's single-origin beans\nBrewing tips for home baristas\nBehind the scenes at the roastery\nInvite cafés to request wholesale samples",
      prohibitedWords: "cheap, guaranteed, best in the world",
      hashtags: "#specialtycoffee #roastery",
      postingCadence: 2,
      preferredPublishTimes: ["09:00", "18:00"],
      defaultPlatforms: ["instagram", "linkedin", "x"],
      channels: { create: (["instagram", "x", "facebook", "linkedin"] as const).map((platform) => ({ platform, accountName: "Demo Coffee Roasters" })) },
    },
  });
  const mk = (name: string, email: string, role: "admin" | "manager" | "creator" | "approver") =>
    db.user.create({ data: { companyId: company.id, name, email, role, passwordHash } });
  const admin = await mk("Amira Admin", "admin@demo.comarketing.test", "admin");
  await mk("Mona Manager", "manager@demo.comarketing.test", "manager");
  const creator = await mk("Karim Creator", "creator@demo.comarketing.test", "creator");
  await mk("Sara Approver", "approver@demo.comarketing.test", "approver");

  const post = await db.post.create({
    data: {
      companyId: company.id,
      title: "Ethiopia Guji launch",
      masterCopy: "Our new Ethiopia Guji single origin is here: notes of peach, jasmine and honey.",
      status: "pending_approval",
      createdById: creator.id,
      variants: {
        create: [
          { platform: "x", copy: "New in: Ethiopia Guji 🍑 Peach, jasmine, honey. Roasted this week. #specialtycoffee" },
          { platform: "linkedin", copy: "We're excited to introduce our Ethiopia Guji single origin — bright notes of peach, jasmine and honey.\n\nCafés: request a wholesale sample from our team." },
        ],
      },
      revisions: { create: { version: 1, title: "Ethiopia Guji launch", masterCopy: "Our new Ethiopia Guji single origin is here.", variants: [], editorId: creator.id } },
      approvalActions: { create: { actorUserId: creator.id, action: "submit" } },
    },
  });
  await db.activityLog.createMany({
    data: [
      { companyId: company.id, actorUserId: admin.id, actorName: admin.name, entityType: "company", entityId: company.id, action: "created demo workspace", outcome: "success" },
      { companyId: company.id, actorUserId: creator.id, actorName: creator.name, entityType: "post", entityId: post.id, action: "submitted for approval", outcome: "success" },
    ],
  });
  console.log(`Demo workspace created. Sign in as admin|manager|creator|approver@demo.comarketing.test with password "${PASSWORD}".`);
}

main().finally(() => db.$disconnect());
