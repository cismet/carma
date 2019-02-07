/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */
package de.cismet.carma;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import org.apache.commons.lang3.ArrayUtils;
import org.apache.log4j.Logger;

/**
 *
 * @author jruiz
 */
public class MavenExcecutor {

    private static final Logger LOG = Logger.getLogger(MavenExcecutor.class);

    private File javaHome;
    private File mavenHome;
    private File workingDir;
    private String[] mvnArgs;
    private String[] execArgs;
    private String[] classpathJars;

    public MavenExcecutor() {
    }

    public void setMvnArgs(final String[] mvnArgs) {
        this.mvnArgs = mvnArgs;
    }

    public void setExecArgs(final String[] execArgs) {
        this.execArgs = execArgs;
    }

    public void setClasspathJars(final String[] classpathJars) {
        this.classpathJars = classpathJars;
    }

    public int execute() throws Exception {
        final StringBuffer classpathSb = new StringBuffer("-classpath %classpath");
        for (final String classpathJar : classpathJars) {
            classpathSb.append(":").append(classpathJar);
        }
        final String classpathArg = classpathSb.toString();

        final String[] mvnCmd = (String[]) ArrayUtils.addAll(
                new String[]{
                    new File(Environment.M2_HOME.getValue(), "bin/mvn").getCanonicalPath(),
                    "-Dexec.workingdir=" + workingDir,
                    "-Dexec.executable=" + javaHome + "/jre/bin/java"
                },
                ArrayUtils.addAll(
                        new String[]{
                            "\"-Dexec.args=" + String.join(" ", ArrayUtils.addAll(new String[]{classpathArg}, execArgs)) + "\""
                        },
                        (String[]) mvnArgs)
        );

        final Runtime runtime = Runtime.getRuntime();
        final Process process = runtime.exec(mvnCmd, new String[]{"M2_HOME=" + mavenHome, "DISPLAY=:0.0"}, workingDir);

        String line;

        try (final BufferedReader in = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            while ((line = in.readLine()) != null) {
                System.out.println(line);
            }
        }

        try (final BufferedReader err = new BufferedReader(new InputStreamReader(process.getErrorStream()))) {
            while ((line = err.readLine()) != null) {
                System.err.println(line);
            }
        }

        return process.waitFor();
    }

    public void setJavaHome(final File javaHome) {
        this.javaHome = javaHome;
    }

    public void setMavenHome(final File mavenHome) {
        this.mavenHome = mavenHome;
    }

    public void setWorkingDir(final File workingDir) {
        this.workingDir = workingDir;
    }
   
}