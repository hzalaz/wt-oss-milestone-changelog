'use latest';

import Github from 'github';

const github = new Github({
    // required
    version: "3.0.0",
    // optional
    debug: false,
    protocol: "https",
    host: "api.github.com",
    pathPrefix: "",
    timeout: 5000,
    headers: {
      "user-agent": "auth0-oss-changelog"
    }
  });

const issues = (repo, milestoneNumber) => {
  if (!repo) {
    return Promise.reject(`Invalid repo. Missing param ${repo}`);
  }

  if (!milestoneNumber) {
    return Promise.reject(`Invalid milestone. Missing param ${milestoneNumber}`);
  }
  
  var options = {
    user: 'auth0',
    repo: repo,
    milestone: milestoneNumber,
    state: 'closed'
  };
  
  return new Promise((resolve, reject) => {
    github.issues.repoIssues(options, (err, issues) => {
      if (err) {
        return reject(err);
      }
      resolve(issues);
    });
  });  
};

const fetchMilestone = (repo, milestone, state = 'open') => {
  if (!repo) {
    return Promise.reject(`Invalid repo. Missing param ${repo}`);
  }

  if (!milestone) {
    return Promise.reject(`Invalid milestone. Missing param ${milestone}`);
  }
  
  var options = {
    user: 'auth0',
    repo: repo,
    state: state
  };
  
  console.log(`Configured Github client for repo ${repo}`);
  console.log(`Fetching milestones for repo ${repo}`);
  return new Promise((resolve, reject) => {
    github.issues.getAllMilestones(options, (err, milestones) => {
      if (err) {
        return reject(err);
      }
      console.log(milestones);
      const aMilestone = milestones.filter(m => m.title === milestone)[0];
      if (!aMilestone) {
        reject(`Missing milestone ${milestone}`);
      } else {
        resolve(aMilestone);
      }
    });
  });
};

const onlyIssues = (issues) => {
  return Promise.resolve(issues.filter(issue => !issue.pull_request));
};

const onlyPRs = (issues) => {
  return Promise.resolve(issues.filter(issue => issue.pull_request));
};

const changelogTags = [
  'CH: Added',
  'CH: Breaking Change',
  'CH: Changed',
  'CH: Deprecated',
  'CH: Fixed',
  'CH: Removed',
  'CH: Security'
  ];

const changelogItems = {
  added: { label: 'CH: Added', title: 'Added' },
  changed: { label: 'CH: Changed', title: 'Changed' },
  deprecated: { label: 'CH: Deprecated', title: 'Deprecated' },
  removed: { label: 'CH: Removed', title: 'Removed' },
  fixed: { label: 'CH: Fixed', title: 'Fixed' },
  security: { label: 'CH: Security', title: 'Security' },
  breakingChange: { label: 'CH: Breaking Change', title: 'Breaking changes' },
  };
  
const sortPullRequests = (issues) => {
  return Promise
    .all(Object.keys(changelogItems).map(key => {
      const item = changelogItems[key];
      return filterByLabel(issues, item.label, key);
    }))
    .then(values => Object.assign({}, ...values));  
};

const filterByLabel = (issues, label, key) => {
  console.log(`filtering for label ${label}`);
  return Promise.resolve({[key]: issues.filter(issue => issue.labels.find(tag => tag.name == label))});
};

const json = (res, json) => {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8'});
  res.end(JSON.stringify(json));
};

const markdown = (res, result) => {
  res.writeHead(200, { 'Content-Type': 'text/markdown; charset=UTF-8'});
  
  if (result.issues.length > 0) {
    res.write('**Closed issues**\n');
    result.issues.forEach(issue => res.write(`- ${issue.title} [\\#${issue.number}](${issue.html_url})\n`));
  }
  
  Object
    .keys(result.prs)
    .map(key => [key, result.prs[key]])
    .filter(([key, prs]) => prs.length > 0)
    .forEach(([kind, pulls]) => {
      res.write('\n');  
      res.write(`**${changelogItems[kind].title}**\n`);
      pulls.forEach(pr => res.write(`- ${pr.title} [\\#${pr.number}](${pr.html_url}) ([${pr.user.login}](${pr.user.html_url}))\n`));
    });
  
  res.end();
};

const error = (res, error) => {
  console.log(error);
  res.writeHead(500, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({'error': error}));
};

/**
 * Auth0 Changelog Generator: This task queries issues from a repo based on a milestone to generate a CHANGELOG following guidelines at http://keepachangelog.com
 *
 * @param {String} context.data.GITHUB_API_TOKEN `--secret` A GH personal access token with permissions to create status checks for Pull Requests
 * @param {String} context.data.repo The repo to query
 * @param {String} context.data.milestone The milestone to use as filter
 * @param {String} context.data.state The state of the milestone
 */
module.exports = (context, req, res) => {
  const contentType = req.headers['accept'] || req.headers['content-type'] || 'application/json';
  const serializer = contentType.startsWith('text/markdown') ? markdown : json;
  console.log(`Preparing to return changelog as ${contentType.startsWith('text/markdown') ? 'markdown' : 'json'}`);
  const repo = context.data.repo;
  const milestone = context.data.milestone;
  
  return fetchMilestone(repo, milestone, context.data.state)
    .then(m => issues(repo, m.number))
    .then(l => Promise.all([onlyIssues(l), onlyPRs(l).then(sortPullRequests)]))
    .then(([issues, prs]) => ({issues: issues, prs: prs}))
    .then(result => serializer(res, result))
    .catch(e => error(res, e));
};
