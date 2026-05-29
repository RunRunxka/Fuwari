---
title: "🧩 Git 入门教程：从零开始掌握版本控制"
published: 2026-05-29
description: "一篇适合新手的 Git 入门教程，涵盖 Git 安装、初始化仓库、提交代码、分支管理、远程仓库协作和常见问题处理。"
tags: [Git, GitHub, 版本控制, 教程]
category: 教程
lang: zh_CN
draft: false
pinned: false
ai_level: 2
image: ""
---

::ai-summary
这篇文章是一份面向新手的 Git 入门教程，介绍了 Git 的基本概念、常用命令、分支管理、远程仓库协作、冲突解决以及撤销修改等日常开发中最常用的操作。
::

## 前言

如果你正在学习编程，或者已经开始写项目，那么 Git 基本上是绕不开的工具。

它可以帮我们记录代码修改历史，也可以让多人协作开发变得更加安全和高效。

简单来说，Git 能解决这些问题：

- 代码写坏了，可以回到之前的版本
- 想知道某一行代码是谁改的
- 多个人可以同时开发同一个项目
- 不同功能可以放在不同分支里开发
- 可以把代码同步到 GitHub、GitLab 或 Gitee

这篇文章会从零开始，带你掌握 Git 的日常使用方式。

:::tip
如果你是第一次接触 Git，不需要一次性记住所有命令。先掌握 `git status`、`git add`、`git commit`、`git push`、`git pull` 这几个命令就够用了。
:::

## Git 是什么？

Git 是一个版本控制工具。

所谓版本控制，就是帮你记录文件每一次变化。

比如你今天写了一个登录功能，明天又修改了页面样式，后天发现登录功能被改坏了。如果没有 Git，你可能只能靠备份文件找回之前的代码。

但如果你用了 Git，就可以很方便地查看历史记录，甚至回退到某个正常版本。

## Git 和 GitHub 有什么区别？

很多新手会把 Git 和 GitHub 混在一起，其实它们不是一回事。

| 名称 | 作用 |
| --- | --- |
| Git | 本地版本控制工具 |
| GitHub | 远程代码托管平台 |
| GitLab | 远程代码托管平台 |
| Gitee | 国内常用代码托管平台 |

可以这样理解：

```text
Git 是工具，GitHub 是存代码的网站。
```

即使你不使用 GitHub，也可以在本地正常使用 Git。

## 安装 Git

### Windows

Windows 用户可以直接去 Git 官网下载安装包：

:url[https://git-scm.com/]

安装时一路默认即可。

安装完成后，可以在桌面或文件夹中右键，如果看到 `Git Bash Here`，说明安装成功。

然后打开终端，输入：

```shellsession
$ git --version
git version 2.x.x
```

如果能看到版本号，就说明 Git 已经安装好了。

### macOS

如果你安装了 Homebrew，可以使用：

```shellsession
$ brew install git
```

也可以直接输入：

```shellsession
$ git --version
```

如果系统提示安装开发者工具，按照提示安装即可。

### Linux

Ubuntu 或 Debian 系统：

```shellsession
$ sudo apt install git
```

CentOS 系统：

```shellsession
$ sudo yum install git
```

安装完成后检查版本：

```shellsession
$ git --version
```

## 配置 Git 用户信息

第一次使用 Git，需要配置用户名和邮箱。

```shellsession
$ git config --global user.name "你的名字"
$ git config --global user.email "你的邮箱"
```

例如：

```shellsession
$ git config --global user.name "Run"
$ git config --global user.email "run@example.com"
```

查看当前配置：

```shellsession
$ git config --list
```

这些信息会出现在你的每一次提交记录里。

:::note
这里的邮箱建议和 GitHub、GitLab 或 Gitee 账号邮箱保持一致，这样提交记录更容易正确关联到你的账号。
:::

## 创建一个 Git 仓库

Git 仓库就是被 Git 管理的项目目录。

创建仓库有两种常见方式。

## 方式一：初始化本地项目

假设你已经有一个项目目录：

```shellsession
$ cd my-project
```

然后初始化 Git：

```shellsession
$ git init
```

执行成功后，项目目录下会生成一个隐藏文件夹：

```text
.git
```

这个 `.git` 文件夹保存了 Git 的版本记录。

:::caution
不要随便删除 `.git` 文件夹，否则这个项目的 Git 历史记录会丢失。
:::

## 方式二：克隆远程仓库

如果项目已经在 GitHub、GitLab 或 Gitee 上，可以直接克隆：

```shellsession
$ git clone 仓库地址
```

例如：

```shellsession
$ git clone https://github.com/example/demo.git
```

克隆完成后，会生成一个项目文件夹：

```shellsession
$ cd demo
```

## Git 的三个核心区域

学习 Git 时，需要理解三个区域：

```text
工作区 -> 暂存区 -> 本地仓库
```

| 区域 | 含义 |
| --- | --- |
| 工作区 | 你正在编辑的文件 |
| 暂存区 | 准备提交的文件 |
| 本地仓库 | 已经正式保存的版本记录 |

日常使用 Git 的流程一般是：

```text
修改文件 -> git add -> git commit
```

也就是说，文件修改后，需要先加入暂存区，然后再提交到本地仓库。

## 查看文件状态

`git status` 是最常用的命令之一。

```shellsession
$ git status
```

它可以告诉你：

- 哪些文件被修改了
- 哪些文件还没有被 Git 跟踪
- 哪些文件已经加入暂存区
- 当前所在分支是什么

建议你每次提交前都执行一次：

```shellsession
$ git status
```

这样可以避免把不该提交的文件提交上去。

## 添加文件到暂存区

添加单个文件：

```shellsession
$ git add index.html
```

添加所有修改：

```shellsession
$ git add .
```

`git add .` 会把当前目录下所有修改加入暂存区。

:::important
`git add` 并不是提交代码，它只是把修改放进暂存区。真正保存版本记录需要执行 `git commit`。
:::

## 提交代码

提交代码使用：

```shellsession
$ git commit -m "提交说明"
```

例如：

```shellsession
$ git commit -m "feat: add login page"
```

提交说明建议写清楚本次提交做了什么。

不推荐这样写：

```shellsession
$ git commit -m "update"
```

更推荐这样写：

```shellsession
$ git commit -m "feat: add user login"
$ git commit -m "fix: resolve login button style"
$ git commit -m "docs: update README"
```

常见提交前缀可以参考：

| 前缀 | 含义 |
| --- | --- |
| `feat` | 新功能 |
| `fix` | 修复问题 |
| `docs` | 文档修改 |
| `style` | 样式修改 |
| `refactor` | 代码重构 |
| `chore` | 构建、配置等杂项 |

## 查看提交历史

查看完整提交历史：

```shellsession
$ git log
```

如果觉得内容太多，可以使用简洁模式：

```shellsession
$ git log --oneline
```

输出大概是这样：

```text
a1b2c3d feat: add login page
e4f5g6h docs: update README
i7j8k9l init project
```

每一行前面的字符串就是提交 ID，可以用来回退版本或查看具体修改。

## 查看文件修改内容

查看当前修改：

```shellsession
$ git diff
```

这个命令可以看到你修改了哪些内容。

如果想查看已经加入暂存区的修改，可以使用：

```shellsession
$ git diff --cached
```

## 分支是什么？

分支是 Git 非常重要的功能。

你可以把分支理解成一条独立的开发线。

例如：

```text
main             主分支
feature-login    登录功能分支
feature-pay      支付功能分支
fix-header       修复顶部导航分支
```

不同功能可以在不同分支上开发，互不影响。

## 查看分支

```shellsession
$ git branch
```

当前所在分支前面会有一个 `*`。

例如：

```text
* main
  feature-login
```

说明你当前在 `main` 分支上。

## 创建分支

创建一个新分支：

```shellsession
$ git branch feature-login
```

这个命令只会创建分支，不会自动切换过去。

## 切换分支

切换到指定分支：

```shellsession
$ git switch feature-login
```

旧版本 Git 也可以使用：

```shellsession
$ git checkout feature-login
```

现在更推荐使用 `git switch`，语义更清晰。

## 创建并切换分支

实际开发中，我们经常直接创建并切换到新分支：

```shellsession
$ git switch -c feature-login
```

这相当于：

```shellsession
$ git branch feature-login
$ git switch feature-login
```

## 合并分支

假设你在 `feature-login` 分支完成了登录功能，现在想合并到 `main` 分支。

先切回主分支：

```shellsession
$ git switch main
```

然后执行合并：

```shellsession
$ git merge feature-login
```

如果没有冲突，Git 会自动完成合并。

## 删除分支

功能分支合并完成后，可以删除：

```shellsession
$ git branch -d feature-login
```

如果分支还没有合并，但你确定要强制删除：

```shellsession
$ git branch -D feature-login
```

:::warning
强制删除分支可能会导致未合并的代码丢失，使用前一定要确认。
:::

## 连接远程仓库

如果你想把本地代码推送到 GitHub，需要先添加远程仓库。

查看当前远程仓库：

```shellsession
$ git remote -v
```

添加远程仓库：

```shellsession
$ git remote add origin 仓库地址
```

例如：

```shellsession
$ git remote add origin https://github.com/example/demo.git
```

这里的 `origin` 是远程仓库的默认名称。

## 推送代码到远程仓库

第一次推送：

```shellsession
$ git push -u origin main
```

之后可以直接使用：

```shellsession
$ git push
```

如果你的主分支叫 `master`，则使用：

```shellsession
$ git push -u origin master
```

:::note
现在很多平台默认主分支叫 `main`，以前很多项目默认叫 `master`。具体用哪个，以你的项目实际分支名为准。
:::

## 拉取远程代码

从远程仓库拉取最新代码：

```shellsession
$ git pull
```

它相当于：

```shellsession
$ git fetch
$ git merge
```

也就是说，`git pull` 会先获取远程更新，然后自动合并到当前分支。

如果你只想获取远程更新，但不想自动合并，可以使用：

```shellsession
$ git fetch
```

## 解决代码冲突

多人协作时，很容易遇到代码冲突。

例如，两个人同时修改了同一个文件的同一行，Git 不知道应该保留谁的修改，就会产生冲突。

冲突内容通常长这样：

```text
<<<<<<< HEAD
这是你的代码
=======
这是别人的代码
>>>>>>> feature-branch
```

你需要手动编辑文件，决定保留哪一部分。

修改完成后执行：

```shellsession
$ git add .
$ git commit -m "fix: resolve merge conflict"
```

:::tip
解决冲突时不要慌，先看清楚两边代码分别是什么，再决定保留、删除或合并。
:::

## 撤销工作区修改

如果你修改了文件，但还没有执行 `git add`，可以使用：

```shellsession
$ git restore 文件名
```

例如：

```shellsession
$ git restore index.html
```

撤销所有未暂存修改：

```shellsession
$ git restore .
```

:::warning
这个操作会丢弃工作区修改，执行前要确认这些修改不需要了。
:::

## 撤销暂存区文件

如果你已经执行了 `git add`，但还没有提交，可以把文件从暂存区撤回来：

```shellsession
$ git restore --staged 文件名
```

例如：

```shellsession
$ git restore --staged index.html
```

这样文件修改还在，只是不再处于暂存状态。

## 回退版本

如果想回退到上一个版本，可以使用：

```shellsession
$ git reset --hard HEAD^
```

如果想回退到指定提交：

```shellsession
$ git reset --hard 提交ID
```

例如：

```shellsession
$ git reset --hard a1b2c3d
```

:::warning
`git reset --hard` 会丢弃当前未提交的修改，使用前一定要谨慎。
:::

如果代码已经推送到远程仓库，更推荐使用：

```shellsession
$ git revert 提交ID
```

`git revert` 会创建一个新的提交，用来撤销之前的提交，更适合团队协作。

## 临时保存修改

有时候你正在写一个功能，突然需要切换分支修 bug，但当前代码还不想提交。

这时可以使用：

```shellsession
$ git stash
```

查看临时保存列表：

```shellsession
$ git stash list
```

恢复最近一次保存：

```shellsession
$ git stash pop
```

只恢复但不删除 stash：

```shellsession
$ git stash apply
```

## 使用 .gitignore 忽略文件

有些文件不应该提交到仓库，比如：

- 依赖目录
- 编译产物
- 日志文件
- 本地环境变量
- 密钥文件

可以在项目根目录创建 `.gitignore` 文件。

Node.js 项目常见写法：

```gitignore
node_modules/
dist/
.env
*.log
```

Python 项目常见写法：

```gitignore
__pycache__/
*.pyc
.env
venv/
```

如果某个文件已经被 Git 跟踪，后来再加入 `.gitignore` 不会自动生效。

需要先取消跟踪：

```shellsession
$ git rm --cached 文件名
```

例如：

```shellsession
$ git rm --cached .env
```

## 日常开发推荐流程

一个比较常见的 Git 开发流程如下：

```shellsession
$ git pull
$ git switch -c feature-login
```

然后修改代码。

修改完成后：

```shellsession
$ git status
$ git add .
$ git commit -m "feat: add login feature"
$ git push -u origin feature-login
```

之后可以在 GitHub、GitLab 或 Gitee 上创建 Pull Request / Merge Request，让别人进行代码审核。

审核通过后，再合并到主分支。

## 常用命令速查表

| 命令 | 作用 |
| --- | --- |
| `git init` | 初始化仓库 |
| `git clone 仓库地址` | 克隆远程仓库 |
| `git status` | 查看文件状态 |
| `git add .` | 添加所有修改到暂存区 |
| `git commit -m "说明"` | 提交代码 |
| `git log --oneline` | 查看简洁提交历史 |
| `git branch` | 查看分支 |
| `git switch 分支名` | 切换分支 |
| `git switch -c 分支名` | 创建并切换分支 |
| `git merge 分支名` | 合并分支 |
| `git pull` | 拉取远程代码 |
| `git push` | 推送代码 |
| `git remote -v` | 查看远程仓库 |
| `git stash` | 临时保存修改 |
| `git stash pop` | 恢复临时保存的修改 |
| `git restore 文件名` | 撤销工作区修改 |
| `git revert 提交ID` | 安全撤销某次提交 |

## 我的 Git 使用建议

### 提交前先看状态

每次提交前建议先执行：

```shellsession
$ git status
```

确认哪些文件会被提交。

### 一次提交只做一件事

不要把很多无关修改放在同一个提交里。

不推荐：

```shellsession
$ git commit -m "改了一堆东西"
```

推荐：

```shellsession
$ git commit -m "feat: add login page"
$ git commit -m "fix: fix login error message"
$ git commit -m "docs: update usage guide"
```

### 不要提交敏感信息

这些内容最好不要提交到仓库：

- 密码
- Token
- API Key
- 数据库连接地址
- `.env` 文件
- 私钥文件

如果不小心提交了敏感信息，要及时删除并更换密钥。

### 团队协作时不要乱改历史

如果代码已经推送到远程仓库，不建议随便使用：

```shellsession
$ git reset --hard
$ git push --force
```

这可能会影响其他人的提交历史。

## 总结

Git 是开发者必须掌握的基础工具。

刚开始学习时，不需要追求一次性记住所有命令。先掌握下面这几个就可以满足大多数日常需求：

```shellsession
$ git status
$ git add .
$ git commit -m "说明"
$ git pull
$ git push
$ git branch
$ git switch
$ git merge
```

日常开发最常见的流程就是：

```text
修改代码 -> 添加暂存 -> 提交版本 -> 推送远程
```

等你熟悉基础操作之后，再去学习 `rebase`、`tag`、`cherry-pick` 等进阶命令会更轻松。

总之，Git 的核心目标就是：让代码修改有迹可循，让协作开发更加安全。✨