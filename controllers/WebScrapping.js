// controllers/jobsController.js
import axios from "axios";
import * as cheerio from "cheerio";
import Parser from "rss-parser";
//import Redis from "ioredis";
import puppeteer from "puppeteer";
const parser = new Parser();
//const redis = new Redis(); // default localhost:6379

const CACHE_DURATION = 10 * 60; // 10 minutes
export const jobsController = async (req, res) => {
    try {
        const { skills, location = "India", role = "" } = req.body;

        if (!skills || skills.length === 0)
            return res.status(400).json({ error: "No skills provided" });

        //const cacheKey = `jobs-${skills.join("-")}-${location}-${role}`;
        //const cached = await redis.get(cacheKey);
        //if (cached) return res.json(JSON.parse(cached));

        console.log("Scraping jobs for:", skills.join(", "), location);

        // Scrape all sources in parallel
        const [fwJobs, timesJobs, naukriJobs] = await Promise.all([
            scrapeFreshersworld(skills, location),
            scrapeTimesJobs(skills, location),
            scrapeNaukri(skills, location),
        ]);

        console.log(`Fetched Jobs: Freshersworld=${fwJobs.length}, TimesJobs=${timesJobs.length}, Naukri=${naukriJobs.length}`);

        // Merge, remove duplicates, filter recent jobs
        let allJobs = [...fwJobs, ...timesJobs, ...naukriJobs];
        allJobs = removeDuplicates(filterRecentJobs(allJobs));

        // Semantic scoring
        const scoredJobs = allJobs
            .map(job => ({
                ...job,
                matchScore: calMatchScore(skills, job.title + " " + job.description),
            }))
            .sort((a, b) => b.matchScore - a.matchScore)
            .slice(0, 25);

        //await redis.set(cacheKey, JSON.stringify(scoredJobs), "EX", CACHE_DURATION);

        res.json(scoredJobs);
    } catch (error) {
        console.error("Jobs scraping error:", error);
        res.status(500).json({ error: "Failed to fetch jobs" });
    }
};

// ===== Freshersworld Scraper =====
export async function scrapeFreshersworld(skills, location) {
    try {
        if (!skills.length) return [];
        const query = encodeURIComponent(skills.join(" "));
        const loc = encodeURIComponent(location);
        const url = `https://www.freshersworld.com/jobs/jobsearch/${query}-jobs-in-${loc}`;

        const response = await axios.get(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        const $ = cheerio.load(response.data);

        const jobs = [];
        $(".job-container").each((i, el) => {
            if (jobs.length >= 8) return false;
            const titleTag = $(el).find("h3 a");
            const companyTag = $(el).find(".comp-name");
            const locTag = $(el).find(".job-location");
            const descTag = $(el).find(".desc");
            const link = titleTag.attr("href");

            const title = titleTag.text().trim();
            const company = companyTag.text().trim();
            const jobLocation = locTag.text().trim() || location;
            const description = descTag.text().trim();

            if (title && company) {
                jobs.push({
                    title,
                    company,
                    location: jobLocation,
                    description,
                    link: link ? `https://www.freshersworld.com${link}` : null,
                    source: "Freshersworld",
                });
            }
        });

        return jobs;
    } catch (error) {
        console.error("Freshersworld scraping failed:", error.message);
        return [];
    }
}

// ===== TimesJobs Scraper =====
export async function scrapeTimesJobs(skills, location) {
    try {
        if (!skills.length) return [];
        const query = encodeURIComponent(skills.join(" "));
        const loc = encodeURIComponent(location);

        const jobs = [];
        for (let page = 1; page <= 2; page++) {
            const url = `https://www.timesjobs.com/candidate/job-search.html?searchType=personalizedSearch&from=submit&txtKeywords=${query}&txtLocation=${loc}&sequence=${page}`;
            const response = await axios.get(url, { headers: { "User-Agent": "Mozilla/5.0" } });
            const $ = cheerio.load(response.data);

            $(".clearfix.job-bx").each((i, el) => {
                if (jobs.length >= 15) return false;
                const titleTag = $(el).find("h2 a");
                const companyTag = $(el).find(".joblist-comp-name");
                const locTag = $(el).find(".top-jd-dtl li span").first();
                const descTag = $(el).find(".list-job-dtl li").first();
                const dateTag = $(el).find(".sim-posted span");

                const title = titleTag.text().trim();
                const company = companyTag.text().trim().replace(/\s+/g, " ");
                const jobLocation = locTag.text().trim() || location;
                const link = titleTag.attr("href");
                const description = descTag.text().trim();
                const posted = dateTag.text().trim();

                if (title && company) {
                    jobs.push({ title, company, location: jobLocation, description, link, posted, source: "TimesJobs" });
                }
            });
        }

        return jobs;
    } catch (error) {
        console.error("TimesJobs scraping failed:", error.message);
        return [];
    }
}

// ===== Naukri Scraper using Puppeteer =====
export async function scrapeNaukri(skills, location = "India") {
    if (!skills.length) return [];

    try {
        const query = encodeURIComponent(skills.join(" "));
        const loc = encodeURIComponent(location);
        const url = `https://www.naukri.com/${query}-jobs-in-${loc}`;

        const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
        const page = await browser.newPage();

        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
        );

        await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
        await new Promise(resolve => setTimeout(resolve, 5000));
        // Wait for dynamic content

        // Select all job cards
        const jobs = await page.$$eval(".cust-job-tuple", cards => {
            return cards.slice(0, 20).map(card => {
                const titleEl = card.querySelector("a.title");
                const companyEl = card.querySelector("a.comp-name");
                const locationEl = card.querySelector(".loc-wrap .locWdth");
                const expEl = card.querySelector(".exp-wrap .expwdth");
                const descEl = card.querySelector(".job-desc");
                const postedEl = card.querySelector(".job-post-day");

                return {
                    title: titleEl ? titleEl.innerText.trim() : "",
                    company: companyEl ? companyEl.innerText.trim() : "",
                    location: locationEl ? locationEl.innerText.trim() : "India",
                    experience: expEl ? expEl.innerText.trim() : "",
                    description: descEl ? descEl.innerText.trim() : "",
                    link: titleEl ? titleEl.href : "",
                    posted: postedEl ? postedEl.innerText.trim() : "",
                    source: "Naukri"
                };
            });
        });

        await browser.close();
        return jobs;

    } catch (error) {
        console.error("Naukri Puppeteer scraping failed:", error.message);
        return [];
    }
}

function calMatchScore(skills, text) {
    const lowerText = text.toLowerCase();
    let matchCount = 0;
    skills.forEach(skill => {
        if (lowerText.includes(skill.toLowerCase())) matchCount++;
    });
    return Math.min(100, Math.round((matchCount / skills.length) * 100));
}

function removeDuplicates(jobs) {
    const seen = new Set();
    return jobs.filter(job => {
        const key = `${job.title}-${job.company}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function filterRecentJobs(jobs) {
    return jobs.filter(job => !job.posted || job.posted.includes("Today") || job.posted.includes("day"));
}
